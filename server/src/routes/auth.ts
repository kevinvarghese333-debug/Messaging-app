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
import { isValidPhone, normalizePhone, requestOtp, verifyOtp } from "../services/otp";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { name, email, password, phone } = req.body ?? {};
  if (!name || !email || !password || !phone) {
    return res.status(400).json({ error: "name, email, phone and password are required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!isValidPhone(String(phone))) {
    return res.status(400).json({ error: "Enter a valid phone number (7-15 digits, optional +)" });
  }
  const normalizedPhone = normalizePhone(String(phone));
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: String(email).toLowerCase() }, { phone: normalizedPhone }] },
  });
  if (existing) {
    return res.status(409).json({ error: "An account with this email or phone already exists" });
  }

  // First registered user becomes the admin who can then build the org structure.
  const isFirst = (await prisma.user.count()) === 0;
  const user = await prisma.user.create({
    data: {
      name: String(name),
      email: String(email).toLowerCase(),
      phone: normalizedPhone,
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
  if (user && !user.passwordHash) {
    return res.status(401).json({ error: "This account uses OTP login — switch to the OTP tab" });
  }
  if (!user || !checkPassword(String(password ?? ""), user.passwordHash!)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (!user.active) return res.status(403).json({ error: "This account has been deactivated" });
  const { passwordHash, ...safe } = user;
  res.json({ token: signToken(user.id), user: safe });
});

// OTP login: request a code by phone number or email…
authRouter.post("/otp/request", async (req, res) => {
  try {
    await requestOtp(String(req.body?.identifier ?? ""));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// …then exchange the code for a session token.
authRouter.post("/otp/verify", async (req, res) => {
  try {
    const user = await verifyOtp(String(req.body?.identifier ?? ""), String(req.body?.code ?? ""));
    const full = await prisma.user.findUnique({
      where: { id: user.id },
      include: { department: true },
    });
    const { passwordHash, ...safe } = full!;
    res.json({ token: signToken(user.id), user: safe });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  const { passwordHash, ...safe } = req.user as any;
  res.json({ user: safe });
});
