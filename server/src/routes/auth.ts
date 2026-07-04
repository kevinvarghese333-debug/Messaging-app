import { Router } from "express";
import { prisma } from "../lib/prisma";
import {
  checkPassword,
  hashPassword,
  publicUserSelect,
  requireAuth,
  signToken,
  uniqueHandle,
} from "../lib/auth";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { name, email, password } = req.body ?? {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password are required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  // First registered user becomes the admin who can then build the org structure.
  const isFirst = (await prisma.user.count()) === 0;
  const user = await prisma.user.create({
    data: {
      name: String(name),
      email: String(email).toLowerCase(),
      handle: await uniqueHandle(String(name)),
      passwordHash: hashPassword(String(password)),
      roleLevel: isFirst ? "ADMIN" : "MEMBER",
    },
    select: publicUserSelect,
  });

  // New users automatically join all public org-wide channels.
  const publicChannels = await prisma.channel.findMany({ where: { type: "PUBLIC" } });
  for (const channel of publicChannels) {
    await prisma.channelMember.create({ data: { channelId: channel.id, userId: user.id } }).catch(() => {});
  }

  res.json({ token: signToken(user.id), user });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  const user = await prisma.user.findUnique({
    where: { email: String(email ?? "").toLowerCase() },
    include: { department: true },
  });
  if (!user || !checkPassword(String(password ?? ""), user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (!user.active) return res.status(403).json({ error: "This account has been deactivated" });
  const { passwordHash, ...safe } = user;
  res.json({ token: signToken(user.id), user: safe });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const { passwordHash, ...safe } = req.user as any;
  res.json({ user: safe });
});
