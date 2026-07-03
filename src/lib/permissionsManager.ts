import { supabase } from "./supabase";

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
    const { data: userRow } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .eq("tenant_id", context.tenantId)
      .maybeSingle();
    if (!userRow) return false;

    const roleName = userRow.role || "support";

    // 2. Check granular role permissions
    const { data: roleRows } = await supabase
      .from("role_permissions")
      .select("permissions")
      .eq("tenant_id", context.tenantId)
      .eq("role_name", roleName)
      .limit(1);

    let roleHasAccess = false;
    if (roleRows && roleRows.length > 0) {
      const rolePerms = roleRows[0].permissions || {};
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
    const { data: abacRows } = await supabase
      .from("resource_permissions")
      .select("conditions")
      .eq("tenant_id", context.tenantId)
      .eq("user_id", userId)
      .eq("resource", resource);

    if (abacRows && abacRows.length > 0) {
      for (const abacData of abacRows) {
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
