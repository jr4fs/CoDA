import { Router, Request, Response, NextFunction } from "express";
import { createUser, loginUser, refreshAccessToken } from "../services/accounts.service";
const router = Router();

// Public self-service signup is disabled by default for credentialed deployments.
// Set ALLOW_SIGNUP=true to re-enable open registration (e.g. local dev). When
// disabled, accounts are provisioned out-of-band (see docs/deploy-aws.md).
function signupGuard(_req: Request, res: Response, next: NextFunction) {
  if (process.env.ALLOW_SIGNUP === "true") {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Self-service signup is disabled. Contact an administrator for access.",
  });
}

router.post("/signup", signupGuard, createUser);
router.post("/login", loginUser);
router.post('/refresh', refreshAccessToken);

export default router;