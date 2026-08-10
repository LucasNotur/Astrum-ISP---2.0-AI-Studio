import { NextFunction, Request, Response } from "express";
import admin from "../lib/firebaseAdmin";
import { verifySupabaseToken } from "../lib/authVerify";

export const requirePermission = (resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // MT-04: SEM fallback x-user-id/body.userId — isso permitia forjar a identidade
      // apenas setando um header. Exige sempre um Bearer token verificado.
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Authorization header" });
      }
      const token = authHeader.split("Bearer ")[1];
      let decodedToken;
      try {
        decodedToken = await verifySupabaseToken(token);
      } catch (e) {
        return res.status(401).json({ error: "Invalid token" });
      }
      (req as any).userId = decodedToken.uid;

      const userId = decodedToken.uid;
      const tenantId = (req as any).tenantId ?? decodedToken.tenantId;

      if (!tenantId) {
        return res
          .status(400)
          .json({ error: "TenantId required before permission check" });
      }

      // MT-04: contexto ABAC só com dados server-side (tenant + params de rota),
      // NUNCA mesclar body/query controlados pelo cliente (poderiam satisfazer condições ABAC).
      const context = {
        tenantId,
        ...(req.params || {}),
      };

      const hasAccess = await checkPermissionAdmin(
        userId,
        resource,
        action,
        context,
      );

      if (!hasAccess) {
        return res.status(403).json({
          error: "Acesso Negado",
          details: `Ação '${action}' em '${resource}' negada. Detalhes: Role do usuário não possui nível de acesso suficiente.`,
        });
      }

      next();
    } catch (e: any) {
      return res
        .status(500)
        .json({
          error: "Internal server error checking permissions",
          details: e.message,
        });
    }
  };
};

export async function checkPermissionAdmin(
  userId: string,
  resource: string,
  action: string,
  context?: any,
): Promise<boolean> {
  if (!userId || !context?.tenantId) return false;

  const db = admin.firestore();

  try {
    // 1. Get user role
    const usersSnap = await db
      .collection("users")
      .where("uid", "==", userId)
      .where("tenantId", "==", context.tenantId)
      .limit(1)
      .get();

    if (usersSnap.empty) return false;

    const userData = usersSnap.docs[0].data();
    const roleName = userData.role || "support";

    // 2. Check granular role permissions
    const rolesSnap = await db
      .collection("role_permissions")
      .where("tenant_id", "==", context.tenantId)
      .where("role_name", "==", roleName)
      .limit(1)
      .get();

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
    const abacSnap = await db
      .collection("resource_permissions")
      .where("tenant_id", "==", context.tenantId)
      .where("user_id", "==", userId)
      .where("resource", "==", resource)
      .get();

    if (!abacSnap.empty) {
      for (const doc of abacSnap.docs) {
        const abacData = doc.data();
        const conditions = abacData.conditions || {};
        let matchesAll = true;

        for (const key of Object.keys(conditions)) {
          if (context[key] !== conditions[key]) {
            matchesAll = false;
            break;
          }
        }

        if (!matchesAll) {
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.error("Error checking admin permissions:", error);
    return false;
  }
}
