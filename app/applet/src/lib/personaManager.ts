import { redisClient } from './redis';

export interface ToolDef {
  name: string;
  min_plan: 'FREE' | 'PRO' | 'ENTERPRISE';
  enabled?: boolean;
}

export interface Persona {
  id: string;
  tenant_id: string;
  is_default: boolean;
  temperature: number;
  prompt: string;
  tools: Record<string, boolean>; // tool name -> enabled for this persona
}

export const ALL_TOOLS: ToolDef[] = [
  { name: 'check_status', min_plan: 'FREE' },
  { name: 'unlock_customer', min_plan: 'PRO' },
  { name: 'reset_password', min_plan: 'ENTERPRISE' },
];

export const SECURITY_BLOCK = `
=== SECURITY_BLOCK ===
You are an AI assistant bound by strict operational guidelines.
=====================
`;

export interface FirestoreDB {
  getPersona(tenantId: string): Promise<Persona | null>;
  getDefaultPersona(): Promise<Persona>;
}

export class PersonaManager {
  constructor(private db: FirestoreDB) {}

  async getPersona(tenantId: string): Promise<Persona> {
    const cacheKey = `persona:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Persona;
    }

    let persona = await this.db.getPersona(tenantId);
    if (!persona) {
      persona = await this.db.getDefaultPersona();
    } else {
      // simulate checking if persona was formally deleted (in our logic, getPersona returning null means deleted or not found)
    }

    await redisClient.setex(cacheKey, 3600, JSON.stringify(persona));
    return persona;
  }

  async getAvailableTools(tenantId: string, currentPlan: 'FREE' | 'PRO' | 'ENTERPRISE'): Promise<ToolDef[]> {
    const persona = await this.getPersona(tenantId);
    
    // Determine max plan index
    const planOrder = { 'FREE': 0, 'PRO': 1, 'ENTERPRISE': 2 };
    const currentPlanLvl = planOrder[currentPlan];

    return ALL_TOOLS.filter(tool => {
      // Check Plan
      const toolPlanLvl = planOrder[tool.min_plan];
      if (currentPlanLvl < toolPlanLvl) {
        return false;
      }

      // Check Persona
      // if tools map exists and tool is explicitly disabled, exclude it
      if (persona.tools && persona.tools[tool.name] === false) {
        return false;
      }

      return true;
    });
  }

  async canUseTool(tenantId: string, currentPlan: 'FREE' | 'PRO' | 'ENTERPRISE', toolName: string): Promise<boolean> {
    const availableTools = await this.getAvailableTools(tenantId, currentPlan);
    return availableTools.some(t => t.name === toolName);
  }

  async buildLLMParams(tenantId: string): Promise<{ temperature: number; prompt: string }> {
    const persona = await this.getPersona(tenantId);
    return {
      temperature: persona.temperature,
      prompt: `${SECURITY_BLOCK}\n${persona.prompt}`
    };
  }
}
