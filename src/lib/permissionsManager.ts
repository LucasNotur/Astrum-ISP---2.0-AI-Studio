import { db } from "./firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

export type Action =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "manage"
  | string;
export type Resource =
  | "customers"
  | "tickets"
  | "billing"
  | "os"
  | "dashboard"
  | "chat"
  | "settings"
  | string;

export interface PermissionContext {
  tenantId?: string;
  departmentId?: string;
  ticketId?: string;
  customerId?: string;
  [key: string]: any;
}

export async function checkPermission(
  userId: string,
  resource: Resource,
  action: Action,
  context?: PermissionContext,
): Promise<boolean> {
  if (!userId || !context?.tenantId) return false;

  try {
    // 1. Get user role
    const usersSnap = await getDocs(
      query(
        collection(db, "users"),
        where("uid", "==", userId),
        where("tenantId", "==", context.tenantId),
      ),
    );
    if (usersSnap.empty) return false;

    const userData = usersSnap.docs[0].data();
    const roleName = userData.role || "support";

    // 2. Check granular role permissions
    const rolesSnap = await getDocs(
      query(
        collection(db, "role_permissions"),
        where("tenant_id", "==", context.tenantId),
        where("role_name", "==", roleName),
      ),
    );

    let roleHasAccess = false;
    if (!rolesSnap.empty) {
      const rolePerms = rolesSnap.docs[0].data().permissions || {};
      const resourcePerms = rolePerms[resource];

      if (resourcePerms) {
        if (
          Array.isArray(resourcePerms) &&
          (resourcePerms.includes(action) || resourcePerms.includes("manage"))
        ) {
          roleHasAccess = true;
        } else if (resourcePerms === "*") {
          roleHasAccess = true;
        }
      }
    } else {
      // Fallback for default roles if not in DB yet
      if (roleName === "admin" || roleName === "owner") {
        roleHasAccess = true;
      }
    }

    if (!roleHasAccess) return false;

    // 3. Check ABAC (Resource Permissions) - e.g. operator X specific to a department
    const abacSnap = await getDocs(
      query(
        collection(db, "resource_permissions"),
        where("tenant_id", "==", context.tenantId),
        where("user_id", "==", userId),
        where("resource", "==", resource),
      ),
    );

    if (!abacSnap.empty) {
      for (const doc of abacSnap.docs) {
        const abacData = doc.data();
        // Condition matching example: {"departmentId": "dep-1"}
        const conditions = abacData.conditions || {};
        let matchesAll = true;

        for (const key of Object.keys(conditions)) {
          if (context[key] !== conditions[key]) {
            matchesAll = false;
            break;
          }
        }

        // Se tiver condition E bateu, beleza
        // Se for uma restrição exclusivista e não bateu, podemos retornar false?
        // Simplificando o ABAC: se existe regra ABAC para esse resource/user, ele SÓ tem acesso se as conditions baterem.
        if (!matchesAll) {
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.error("Error checking permissions:", error);
    return false;
  }
}
