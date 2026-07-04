import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
  ]);
  res.json({ notifications, unreadCount });
});

notificationsRouter.post("/read", async (req, res) => {
  const { ids } = req.body ?? {};
  await prisma.notification.updateMany({
    where: {
      userId: req.user.id,
      readAt: null,
      ...(Array.isArray(ids) && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});
