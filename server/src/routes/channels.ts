import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";

export const channelsRouter = Router();

channelsRouter.use(requireAuth);

// All channels visible to me (my memberships + public channels), with unread counts.
channelsRouter.get("/", async (req, res) => {
  const userId = req.user.id;
  const channels = await prisma.channel.findMany({
    where: {
      OR: [{ type: "PUBLIC" }, { members: { some: { userId } } }],
    },
    include: {
      department: { select: { id: true, name: true } },
      members: {
        include: { user: { select: { id: true, name: true, handle: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const result = [];
  for (const channel of channels) {
    const membership = channel.members.find((m) => m.userId === userId);
    const unread = await prisma.message.count({
      where: {
        channelId: channel.id,
        authorId: { not: userId },
        ...(membership?.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
      },
    });
    const { members, ...rest } = channel;
    result.push({
      ...rest,
      isMember: !!membership,
      unread: membership ? unread : 0,
      // For DMs the client needs the other participant to label the channel.
      dmWith:
        channel.type === "DM"
          ? members.map((m) => m.user).find((u) => u.id !== userId) ?? null
          : null,
      memberCount: members.length,
    });
  }
  res.json({ channels: result });
});

channelsRouter.post("/", async (req, res) => {
  const { name, type = "PUBLIC", departmentId, memberIds = [] } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name is required" });
  if (!["PUBLIC", "PRIVATE"].includes(type)) {
    return res.status(400).json({ error: "type must be PUBLIC or PRIVATE" });
  }

  const memberSet = new Set<string>([req.user.id, ...memberIds]);
  if (departmentId) {
    const deptUsers = await prisma.user.findMany({
      where: { departmentId, active: true },
      select: { id: true },
    });
    for (const u of deptUsers) memberSet.add(u.id);
  }

  const channel = await prisma.channel.create({
    data: {
      name: String(name).toLowerCase().replace(/\s+/g, "-"),
      type,
      departmentId: departmentId || null,
      createdById: req.user.id,
      members: { create: [...memberSet].map((userId) => ({ userId })) },
    },
  });
  res.json({ channel });
});

// Find-or-create a direct-message channel with another user.
channelsRouter.post("/dm", async (req, res) => {
  const { userId } = req.body ?? {};
  if (!userId || userId === req.user.id) return res.status(400).json({ error: "userId required" });
  const other = await prisma.user.findUnique({ where: { id: userId } });
  if (!other) return res.status(404).json({ error: "User not found" });

  const dmKey = [req.user.id, userId].sort().join(":");
  let channel = await prisma.channel.findUnique({ where: { dmKey } });
  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        name: dmKey,
        type: "DM",
        dmKey,
        members: { create: [{ userId: req.user.id }, { userId }] },
      },
    });
  }
  res.json({ channel });
});

channelsRouter.post("/:id/join", async (req, res) => {
  const channel = await prisma.channel.findUnique({ where: { id: req.params.id } });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (channel.type !== "PUBLIC") return res.status(403).json({ error: "This channel is private" });
  await prisma.channelMember
    .create({ data: { channelId: channel.id, userId: req.user.id } })
    .catch(() => {}); // already a member
  res.json({ ok: true });
});

channelsRouter.post("/:id/read", async (req, res) => {
  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId: req.params.id, userId: req.user.id } },
    create: { channelId: req.params.id, userId: req.user.id, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
  res.json({ ok: true });
});

channelsRouter.get("/:id", async (req, res) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id },
    include: {
      department: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true, handle: true, roleLevel: true } } } },
    },
  });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  const isMember = channel.members.some((m) => m.userId === req.user.id);
  if (channel.type !== "PUBLIC" && !isMember) {
    return res.status(403).json({ error: "This channel is private" });
  }
  res.json({ channel: { ...channel, isMember } });
});
