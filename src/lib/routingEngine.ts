import { adminDb as db } from "./firebaseAdmin";
import redisClient from "./redis.ts";

export interface Department {
  id: string;
  name: string;
  sla_response_minutes: number;
  sla_resolution_hours: number;
  required_skills: string[];
  routing_mode?: "load_balanced" | "round_robin";
}

export interface Operator {
  id: string;
  name: string;
  email: string;
  skills: string[];
  max_concurrent_chats: number;
  current_chat_count: number;
  status: "online" | "offline" | "busy" | "away";
  department_id: string;
}

export interface Ticket {
  id: string;
  department_id?: string;
  required_skills: string[];
}

export interface RoutingResult {
  operator: Operator | null;
  queueStatus?: {
    inQueue: boolean;
    etaMinutes: number;
    position: number;
  };
}

/**
 * Finds the most suitable online operator for a given department,
 * prioritizing those with the lowest current_chat_count and required skills.
 * Uses a Firestore transaction to increment current_chat_count and avoid race conditions.
 */
export async function findBestOperator(ticket: Ticket, tenantId: string): Promise<RoutingResult> {
  const operatorsRef = db.collection("tenants").doc(tenantId).collection("operators");
  
  try {
    let mode = "load_balanced";
    if (ticket.department_id) {
       const deptDoc = await db.collection("tenants").doc(tenantId).collection("departments").doc(ticket.department_id).get();
       if (deptDoc.exists && deptDoc.data()?.routing_mode === "round_robin") {
           mode = "round_robin";
       }
    }

    return await db.runTransaction(async (transaction) => {
      // Get all online operators for this tenant
      const query = operatorsRef.where("status", "==", "online");
      const snapshot = await transaction.get(query);
      
      if (snapshot.empty) {
        return { operator: null };
      }
      
      const candidates: Operator[] = [];
      let totalOnline = 0;
      snapshot.forEach(doc => {
        const op = { id: doc.id, ...doc.data() } as Operator;
        totalOnline++;
        if (op.current_chat_count < op.max_concurrent_chats) {
          candidates.push(op);
        }
      });
      
      if (candidates.length === 0) {
        // Everyone reached limit -> put in queue
        // We can estimate ETA based on total active tickets or just a simple mock for now
        // Let's find pending tickets count roughly, or just arbitrary
        const pendingSnap = await db.collection("tickets")
            .where("tenantId", "==", tenantId)
            .where("status", "==", "open")
            .where("assigned_to", "==", null)
            .count()
            .get();
        const pendingCount = pendingSnap.data().count;

        return { 
          operator: null,
          queueStatus: {
             inQueue: true,
             position: pendingCount + 1,
             etaMinutes: (pendingCount + 1) * 5 // 5 min per position estimate
          }
        };
      }
      
      // Filter by skills
      let skilledCandidates = candidates;
      if (ticket.required_skills && ticket.required_skills.length > 0) {
        skilledCandidates = candidates.filter(op => 
          ticket.required_skills.every(skill => op.skills && op.skills.includes(skill))
        );
      }
      
      let departmentCandidates = skilledCandidates;
      
      // Prioritize correct department if specified
      if (ticket.department_id) {
        const deptFiltered = skilledCandidates.filter(op => op.department_id === ticket.department_id);
        if (deptFiltered.length > 0) {
            departmentCandidates = deptFiltered;
        }
        // If no one in department has the exact skills, we fallback to anyone in the department
        else {
            const justDept = candidates.filter(op => op.department_id === ticket.department_id);
            if (justDept.length > 0) {
                // If we have someone in the right department but maybe missing some skills
                departmentCandidates = justDept;
            } else if (skilledCandidates.length > 0) {
                // Keep skilled candidates from other departments
                departmentCandidates = skilledCandidates;
            } else {
                departmentCandidates = candidates;
            }
        }
      } else if (skilledCandidates.length === 0) {
          // No specialized skills found anywhere, fallback to anyone
          departmentCandidates = candidates;
      }
      
      if (departmentCandidates.length === 0) {
         // Everyone in this department is maxed out, but globally candidates > 0
         // Let's just fallback to ANY available candidate (maybe bad for strict depts, but ensures service)
         departmentCandidates = candidates;
      }
      
      let bestOperator = departmentCandidates[0];

      if (mode === "round_robin" && departmentCandidates.length > 0 && ticket.department_id && redisClient) {
          const rrKey = `rr_counter:${tenantId}:${ticket.department_id}`;
          const currentCount = await redisClient.incr(rrKey);
          const index = currentCount % departmentCandidates.length;
          bestOperator = departmentCandidates[index];
      } else {
        // Sort to find the best match: prioritize department match, then by lowest load
        departmentCandidates.sort((a, b) => {
            const aDeptMatch = a.department_id === ticket.department_id ? 1 : 0;
            const bDeptMatch = b.department_id === ticket.department_id ? 1 : 0;
            
            if (aDeptMatch !== bDeptMatch) {
                return bDeptMatch - aDeptMatch; // higher match first
            }
            
            return a.current_chat_count - b.current_chat_count;
        });
        
        bestOperator = departmentCandidates[0];
      }
      
      // Atomically update the selected operator's chat count
      const operatorDocRef = operatorsRef.doc(bestOperator.id);
      transaction.update(operatorDocRef, {
        current_chat_count: bestOperator.current_chat_count + 1
      });
      
      return { operator: bestOperator };
    });
  } catch (error) {
    console.error("Error finding best operator in transaction:", error);
    return { operator: null };
  }
}
