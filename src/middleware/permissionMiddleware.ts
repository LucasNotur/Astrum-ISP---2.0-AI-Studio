import { NextFunction, Request, Response } from "express";
import admin from "../lib/firebaseAdmin";
import { verifySupabaseToken } from "../lib/authVerify";

export const requirePermission = (resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        // Fallback for dev or specific integrations
        const fallbackUserId = req.headers["x-user-id"] || req.body?.userId;
        if (!fallbackUserId) {
          return res
            .status(401)
            .json({
              error: "Missing or invalid Authorization header",
              details: "A valid token or 'x-user-id' is required.",
            });
        }
        (req as any).userId = fallbackUserId;
      } else {
        const token = authHeader.split("Bearer ")[1];
        try {
          const decodedToken = await verifySupabaseToken(token);
          (req as any).userId = decodedToken.uid;
        } catch (e) {
          return res.status(401).json({ error: "Invalid token" });
        }
      }

      const userId = (req as any).userId;
      const tenantId = (req as any).tenantId;

      if (!tenantId) {
        return res
          .status(400)
          .json({ error: "TenantId required before permission check" });
      }

      const context = {
        tenantId,
        ...(req.params || {}),
        ...(req.body || {}),
        ...(req.query || {}),
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
