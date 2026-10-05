import { Response } from "express";
import { ObjectId } from "mongodb";
import { AuthRequest } from "../middleware/auth.middleware";
import { getCollection } from "./database.service";
import { isAdminEmail } from "../utils/admin";
import {
  hashPassword,
  validateEmail,
  validatePassword,
  validateUsername,
} from "./accounts.service";

function toView(u: any) {
  return {
    id: u._id.toString(),
    username: u.username,
    email: u.email,
    active: u.active !== false, // legacy users without the field are active
    isAdmin: isAdminEmail(u.email),
    createdAt: u.createdAt,
  };
}

export async function listUsers(_req: AuthRequest, res: Response) {
  try {
    const users = await getCollection("UserDetails")
      .find({}, { projection: { password: 0 } })
      .toArray();
    res.json({ success: true, users: users.map(toView) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to list users" });
  }
}

export async function adminCreateUser(req: AuthRequest, res: Response) {
  try {
    const username = String(req.body.username ?? "");
    const email = String(req.body.email ?? "");
    const password = String(req.body.password ?? "");

    const vu = validateUsername(username);
    const ve = validateEmail(email);
    const vp = validatePassword(password);
    if (!vu.valid || !ve.valid || !vp.valid) {
      return res.status(400).json({
        success: false,
        errors: { username: vu.errors, email: ve.errors, password: vp.errors },
      });
    }

    // Don't let a second "admin" account be minted through this endpoint.
    if (isAdminEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Cannot create an account with the admin email.",
      });
    }

    const users = getCollection("UserDetails");
    if (await users.findOne({ email })) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    const doc = {
      username,
      email,
      password: await hashPassword(password),
      active: true,
      createdAt: new Date().toISOString(),
    };
    const result = await users.insertOne(doc);
    res.status(201).json({ success: true, user: toView({ ...doc, _id: result.insertedId }) });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }
    res.status(500).json({ success: false, message: error.message || "Failed to create user" });
  }
}

export async function adminUpdateUser(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }
    const users = getCollection("UserDetails");
    const target = await users.findOne({ _id: new ObjectId(id) });
    if (!target) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    // The admin account is not manageable here.
    if (isAdminEmail(target.email)) {
      return res.status(403).json({
        success: false,
        message: "The admin account cannot be modified here.",
      });
    }

    const update: Record<string, unknown> = {};

    if (req.body.username !== undefined) {
      const v = validateUsername(String(req.body.username));
      if (!v.valid) return res.status(400).json({ success: false, errors: { username: v.errors } });
      update.username = String(req.body.username);
    }

    if (req.body.email !== undefined) {
      const email = String(req.body.email);
      const v = validateEmail(email);
      if (!v.valid) return res.status(400).json({ success: false, errors: { email: v.errors } });
      if (isAdminEmail(email)) {
        return res.status(400).json({ success: false, message: "Cannot use the admin email." });
      }
      const clash = await users.findOne({ email, _id: { $ne: new ObjectId(id) } });
      if (clash) return res.status(400).json({ success: false, message: "Email already exists" });
      update.email = email;
    }

    if (req.body.password !== undefined && String(req.body.password).length > 0) {
      const password = String(req.body.password);
      const v = validatePassword(password);
      if (!v.valid) return res.status(400).json({ success: false, errors: { password: v.errors } });
      update.password = await hashPassword(password);
    }

    if (typeof req.body.active === "boolean") {
      update.active = req.body.active;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: "No changes provided" });
    }

    update.updatedAt = new Date().toISOString();
    await users.updateOne({ _id: new ObjectId(id) }, { $set: update });
    const updated = await users.findOne({ _id: new ObjectId(id) }, { projection: { password: 0 } });
    res.json({ success: true, user: toView(updated) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to update user" });
  }
}
