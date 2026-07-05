import { Router } from "express";
import { prisma } from "../lib/prisma";
import { publicUserSelect, requireAdmin, requireAuth, uniqueHandle } from "../lib/auth";
import { onlineUserIds } from "../realtime/io";
import { isValidPhone, normalizePhone } from "../services/otp";

export const usersRouter = Router();

usersRouter.use(requireAuth);

const CAN_INVITE = ["MANAGER", "DEPT_HEAD", "ADMIN"];

// Add a teammate under yourself by name + mobile number. They log in via OTP —
// no password, no self-signup, nothing to pay.
usersRouter.post("/invite", async (req, res) => {
  if (!CAN_INVITE.includes(req.user.roleLevel)) {
    return res.status(403).json({ error: "Only managers and above can add team members" });
  }
  const { name, phone, email } = req.body ?? {};
  if (!name || !phone) return res.status(400).json({ error: "name and phone are required" });
  if (!isValidPhone(String(phone))) {
    return res.status(400).json({ error: "Enter a valid phone number (7-15 digits, optional +)" });
  }
  const normalizedPhone = normalizePhone(String(phone));
  const handle = await uniqueHandle(String(name));
  // Email is optional for invited users; a placeholder keeps the column unique.
  const finalEmail = email ? String(email).toLowerCase() : `${handle}@pending.local`;

  const clash = await prisma.user.findFirst({
    where: { OR: [{ phone: normalizedPhone }, { email: finalEmail }] },
  });
  if (clash) return res.status(409).json({ error: "Someone already has this phone number or email" });

  const user = await prisma.user.create({
    data: {
      name: String(name),
      handle,
      email: finalEmail,
      phone: normalizedPhone,
      passwordHash: null, // OTP-only until they set a password
      roleLevel: "MEMBER",
      departmentId: req.user.departmentId,
      managerId: req.user.id,
      invitedById: req.user.id,
    },
    select: publicUserSelect,
  });

  const publicChannels = await prisma.channel.findMany({ where: { type: "PUBLIC" } });
  for (const channel of publicChannels) {
    await prisma.channelMember.create({ data: { channelId: channel.id, userId: user.id } }).catch(() => {});
  }

  res.json({ user });
});

// My reports (direct + one level down) for the "My team" page.
usersRouter.get("/team", async (req, res) => {
  const direct = await prisma.user.findMany({
    where: { managerId: req.user.id },
    select: { ...publicUserSelect, department: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  const secondLevel = await prisma.user.findMany({
    where: { managerId: { in: direct.map((u) => u.id) } },
    select: {
      ...publicUserSelect,
      department: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json({ direct, secondLevel });
});

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      ...publicUserSelect,
      department: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json({ users, online: onlineUserIds() });
});

usersRouter.patch("/:id", requireAdmin, async (req, res) => {
  const { roleLevel, departmentId, managerId, active } = req.body ?? {};
  if (managerId === req.params.id) {
    return res.status(400).json({ error: "A user cannot be their own manager" });
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(roleLevel !== undefined ? { roleLevel } : {}),
      ...(departmentId !== undefined ? { departmentId: departmentId || null } : {}),
      ...(managerId !== undefined ? { managerId: managerId || null } : {}),
      ...(active !== undefined ? { active: Boolean(active) } : {}),
    },
    select: publicUserSelect,
  });
  res.json({ user });
});
