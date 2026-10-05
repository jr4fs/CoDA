import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";
import { isAdminEmail } from "../utils/admin";

// Gate for admin-only endpoints. MUST be chained after authenticateToken so
// req.user is populated from the verified JWT. Authorises solely on the token's
// email matching ADMIN_EMAIL — server-side, unforgeable.
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !isAdminEmail(req.user.email)) {
    return res.status(403).json({
      success: false,
      message: "Admin access required.",
    });
  }
  next();
}
