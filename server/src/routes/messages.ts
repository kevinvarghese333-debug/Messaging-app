import { Router } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";
import { mentionedUserIds, resolveMentions } from "../services/mentionParser";
import { notify } from "../services/notifier";
import { emitToChannel } from "../realtime/io";

export const messagesRouter = Router();

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${crypto.randomBytes(8).toString("hex")}-${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

messagesRouter.use(requireAuth);

export const messageInclude = {
  author: { select: { id: true, name: true, handle: true } },
  mentions: true,
  task: { select: { id: true, status: true, title: true } },
  _count: { select: { replies: true } },
} as const;

async function canAccessChannel(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { members: { where: { userId } } },
  });
  if (!channel) return null;
  if (channel.type !== "PUBLIC" && channel.members.length === 0) return null;
  return channel;
}

// List top-level messages of a channel (threads loaded separately).
messagesRouter.get("/channels/:channelId/messages", async (req, res) => {
  const channel = await canAccessChannel(req.params.channelId, req.user.id);
  if (!channel) return res.status(403).json({ error: "No access to this channel" });

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before ? new Date(String(req.query.before)) : null;

  const messages = await prisma.message.findMany({
    where: {
      channelId: channel.id,
      parentId: null,
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    include: messageInclude,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json({ messages: messages.reverse() });
});

messagesRouter.post(
  "/channels/:channelId/messages",
  upload.single("file"),
  async (req, res) => {
    const channel = await canAccessChannel(req.params.channelId, req.user.id);
    if (!channel) return res.status(403).json({ error: "No access to this channel" });

    const content = String(req.body?.content ?? "").trim();
    const parentId = req.body?.parentId ? String(req.body.parentId) : null;
    if (!content && !req.file) return res.status(400).json({ error: "Message is empty" });

    if (parentId) {
      const parent = await prisma.message.findUnique({ where: { id: parentId } });
      if (!parent || parent.channelId !== channel.id) {
        return res.status(400).json({ error: "Invalid thread parent" });
      }
    }

    // Posting into a public channel makes you a member (so unread tracking works).
    await prisma.channelMember
      .create({ data: { channelId: channel.id, userId: req.user.id } })
      .catch(() => {});

    const mentions = await resolveMentions(content, channel);
    const message = await prisma.message.create({
      data: {
        channelId: channel.id,
        authorId: req.user.id,
        content,
        parentId,
        attachmentPath: req.file ? `/uploads/${req.file.filename}` : null,
        attachmentName: req.file?.originalname ?? null,
        attachmentType: req.file?.mimetype ?? null,
        mentions: {
          create: mentions.map((m) => ({
            targetType: m.targetType,
            targetId: m.targetId,
            targetLabel: m.targetLabel,
          })),
        },
      },
      include: messageInclude,
    });

    emitToChannel(channel.id, "message:new", { message });

    const channelLabel = channel.type === "DM" ? "a direct message" : `#${channel.name}`;
    const toNotify = mentionedUserIds(mentions, req.user.id);
    if (toNotify.length > 0) {
      await notify(toNotify, {
        type: "mention",
        title: `${req.user.name} mentioned you in ${channelLabel}`,
        body: content.slice(0, 140),
        link: `/channels/${channel.id}`,
      });
    }

    // Tell the thread starter someone replied (unless they were already mentioned).
    if (parentId) {
      const parent = await prisma.message.findUnique({ where: { id: parentId } });
      if (parent && parent.authorId !== req.user.id && !toNotify.includes(parent.authorId)) {
        await notify([parent.authorId], {
          type: "thread_reply",
          title: `${req.user.name} replied to your message in ${channelLabel}`,
          body: content.slice(0, 140),
          link: `/channels/${channel.id}?thread=${parentId}`,
        });
      }
    }

    // For DMs, notify the other side even without a mention.
    if (channel.type === "DM") {
      const others = await prisma.channelMember.findMany({
        where: { channelId: channel.id, userId: { not: req.user.id } },
      });
      const otherIds = others.map((m) => m.userId).filter((id) => !toNotify.includes(id));
      if (otherIds.length > 0) {
        await notify(otherIds, {
          type: "dm",
          title: `New message from ${req.user.name}`,
          body: content.slice(0, 140),
          link: `/channels/${channel.id}`,
        });
      }
    }

    res.json({ message });
  }
);

messagesRouter.get("/messages/:id/thread", async (req, res) => {
  const parent = await prisma.message.findUnique({
    where: { id: req.params.id },
    include: messageInclude,
  });
  if (!parent) return res.status(404).json({ error: "Message not found" });
  const channel = await canAccessChannel(parent.channelId, req.user.id);
  if (!channel) return res.status(403).json({ error: "No access to this channel" });

  const replies = await prisma.message.findMany({
    where: { parentId: parent.id },
    include: messageInclude,
    orderBy: { createdAt: "asc" },
  });
  res.json({ parent, replies });
});

// Autocomplete targets for the composer's @mention dropdown.
messagesRouter.get("/mention-targets", async (_req, res) => {
  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, handle: true },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({ select: { id: true, name: true, slug: true } }),
  ]);
  const targets = [
    ...users.map((u) => ({ kind: "user", token: u.handle, label: u.name })),
    ...departments.map((d) => ({ kind: "department", token: d.slug, label: `${d.name} (everyone in dept)` })),
    { kind: "group", token: "managers", label: "Managers" },
    { kind: "group", token: "dept-heads", label: "Department heads" },
    { kind: "group", token: "admins", label: "Admins" },
    { kind: "group", token: "everyone", label: "Everyone in the org" },
  ];
  res.json({ targets });
});
