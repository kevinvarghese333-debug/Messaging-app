import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export type AuthedUser = NonNullable<Awaited<ReturnType<typeof fetchUser>>>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: AuthedUser;
    }
  }
}

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function checkPassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function fetchUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { department: true },
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const userId = token && verifyToken(token);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  const user = await fetchUser(userId);
  if (!user || !user.active) return res.status(401).json({ error: "Not authenticated" });
  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user.roleLevel !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export const publicUserSelect = {
  id: true,
  name: true,
  handle: true,
  email: true,
  phone: true,
  roleLevel: true,
  active: true,
  departmentId: true,
  managerId: true,
  lastSeenAt: true,
} as const;

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function uniqueHandle(name: string) {
  const base = slugify(name).replace(/-/g, ".") || "user";
  let handle = base;
  for (let i = 2; ; i++) {
    const existing = await prisma.user.findUnique({ where: { handle } });
    if (!existing) return handle;
    handle = `${base}${i}`;
  }
}
