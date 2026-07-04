import { Router } from "express";
import { prisma } from "../lib/prisma";
import { publicUserSelect, requireAdmin, requireAuth } from "../lib/auth";
import { onlineUserIds } from "../realtime/io";

export const usersRouter = Router();

usersRouter.use(requireAuth);

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
