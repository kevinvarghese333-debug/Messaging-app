import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";
import { taskInclude } from "../services/taskService";

export const searchRouter = Router();

searchRouter.use(requireAuth);

searchRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json({ messages: [], tasks: [], users: [] });

  const [messages, tasks, users] = await Promise.all([
    // Only search channels the user can see (their memberships + public channels).
    prisma.message.findMany({
      where: {
        content: { contains: q },
        channel: {
          OR: [{ type: "PUBLIC" }, { members: { some: { userId: req.user.id } } }],
        },
      },
      include: {
        author: { select: { id: true, name: true, handle: true } },
        channel: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.task.findMany({
      where: {
        OR: [{ title: { contains: q } }, { description: { contains: q } }],
      },
      include: taskInclude,
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.user.findMany({
      where: {
        active: true,
        OR: [{ name: { contains: q } }, { handle: { contains: q } }, { email: { contains: q } }],
      },
      select: {
        id: true,
        name: true,
        handle: true,
        email: true,
        roleLevel: true,
        department: { select: { id: true, name: true } },
      },
      take: 20,
    }),
  ]);

  res.json({ messages, tasks, users });
});
