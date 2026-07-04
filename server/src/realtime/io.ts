import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import { verifyToken } from "../lib/auth";

let io: Server | null = null;

// userId -> number of open sockets
const onlineCounts = new Map<string, number>();

export function onlineUserIds() {
  return [...onlineCounts.keys()];
}

export function initIo(httpServer: HttpServer) {
  io = new Server(httpServer, { cors: { origin: true } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const userId = token && verifyToken(token);
    if (!userId) return next(new Error("unauthorized"));
    (socket as any).userId = userId;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const userId = (socket as any).userId as string;
    socket.join(`user:${userId}`);

    const count = (onlineCounts.get(userId) ?? 0) + 1;
    onlineCounts.set(userId, count);
    if (count === 1) io!.emit("presence", { userId, online: true });

    socket.on("presence:list", (cb: (ids: string[]) => void) => {
      if (typeof cb === "function") cb(onlineUserIds());
    });

    socket.on("channel:join", async (channelId: string) => {
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: { members: { where: { userId } } },
      });
      if (!channel) return;
      if (channel.type !== "PUBLIC" && channel.members.length === 0) return;
      socket.join(`channel:${channelId}`);
    });

    socket.on("channel:leave", (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on("typing", async (channelId: string) => {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return;
      socket.to(`channel:${channelId}`).emit("typing", { channelId, userId, name: user.name });
    });

    socket.on("disconnect", async () => {
      const remaining = (onlineCounts.get(userId) ?? 1) - 1;
      if (remaining <= 0) {
        onlineCounts.delete(userId);
        io!.emit("presence", { userId, online: false });
        await prisma.user
          .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
          .catch(() => {});
      } else {
        onlineCounts.set(userId, remaining);
      }
    });
  });

  return io;
}

export function emitToUsers(userIds: string[], event: string, payload: unknown) {
  if (!io || userIds.length === 0) return;
  io.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
}

export function emitToChannel(channelId: string, event: string, payload: unknown) {
  if (!io) return;
  io.to(`channel:${channelId}`).emit(event, payload);
}
