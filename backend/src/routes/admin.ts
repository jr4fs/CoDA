import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/admin.middleware";
import { listUsers, adminCreateUser, adminUpdateUser } from "../services/admin.service";

const router = Router();

// Every admin route requires a valid token AND the token's email === ADMIN_EMAIL.
router.use(authenticateToken, requireAdmin);

router.get("/users", listUsers);
router.post("/users", adminCreateUser);
router.patch("/users/:id", adminUpdateUser);

export default router;
