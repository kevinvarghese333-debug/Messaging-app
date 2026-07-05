import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma";

const OTP_TTL_MS = 5 * 60 * 1000; // codes valid 5 minutes
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_REQUESTS_PER_WINDOW = 3;
const REQUEST_WINDOW_MS = 10 * 60 * 1000;

/** Lowercases emails; strips spaces/dashes from phone numbers, keeping a leading +. */
export function normalizeIdentifier(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return normalizePhone(trimmed);
}

export function normalizePhone(raw: string): string {
  const cleaned = String(raw ?? "").replace(/[^\d+]/g, "");
  return cleaned.startsWith("+") ? "+" + cleaned.slice(1).replace(/\+/g, "") : cleaned;
}

export function isValidPhone(raw: string): boolean {
  return /^\+?\d{7,15}$/.test(normalizePhone(raw));
}

function findUserByIdentifier(identifier: string) {
  return prisma.user.findFirst({
    where: identifier.includes("@") ? { email: identifier } : { phone: identifier },
  });
}

/**
 * OTP delivery. Adapters activate based on env config; with none configured
 * (local dev) the code is printed to the server terminal so the flow is testable
 * without any external accounts.
 */
async function deliver(identifier: string, code: string, user: { email: string; phone: string | null }) {
  let deliveredExternally = false;

  if (process.env.RESEND_API_KEY && user.email && !user.email.endsWith(".local")) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.OTP_EMAIL_FROM || "TeamCollab <onboarding@resend.dev>",
          to: [user.email],
          subject: "Your TeamCollab login code",
          text: `Your login code is ${code}. It expires in 5 minutes.`,
        }),
      });
      if (res.ok) deliveredExternally = true;
      else console.error("[otp] email delivery failed:", res.status, await res.text());
    } catch (err) {
      console.error("[otp] email delivery failed:", err);
    }
  }

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM && user.phone) {
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization:
              "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: user.phone,
            From: TWILIO_FROM,
            Body: `Your TeamCollab login code is ${code}. It expires in 5 minutes.`,
          }),
        }
      );
      if (res.ok) deliveredExternally = true;
      else console.error("[otp] SMS delivery failed:", res.status, await res.text());
    } catch (err) {
      console.error("[otp] SMS delivery failed:", err);
    }
  }

  if (!deliveredExternally) {
    console.log(`[otp] Login code for ${identifier}: ${code}  (no SMS/email provider configured — see server/.env)`);
  }
}

export async function requestOtp(rawIdentifier: string): Promise<{ ok: true }> {
  const identifier = normalizeIdentifier(rawIdentifier);
  if (!identifier) return { ok: true };

  const recentCount = await prisma.otpCode.count({
    where: { identifier, createdAt: { gt: new Date(Date.now() - REQUEST_WINDOW_MS) } },
  });
  if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
    const err = new Error("Too many codes requested. Wait a few minutes and try again.");
    (err as any).status = 429;
    throw err;
  }

  const user = await findUserByIdentifier(identifier);
  // Always report success so callers can't probe which phones/emails exist.
  if (!user || !user.active) return { ok: true };

  const code = String(crypto.randomInt(100000, 1000000));
  await prisma.otpCode.updateMany({
    where: { identifier, consumedAt: null },
    data: { consumedAt: new Date() }, // invalidate previous codes
  });
  await prisma.otpCode.create({
    data: {
      identifier,
      codeHash: bcrypt.hashSync(code, 8),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  await deliver(identifier, code, user);
  return { ok: true };
}

export async function verifyOtp(rawIdentifier: string, code: string) {
  const identifier = normalizeIdentifier(rawIdentifier);
  const fail = () => {
    const err = new Error("Invalid or expired code");
    (err as any).status = 401;
    return err;
  };

  const otp = await prisma.otpCode.findFirst({
    where: { identifier, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw fail();
  if (otp.attempts >= MAX_VERIFY_ATTEMPTS) throw fail();

  if (!bcrypt.compareSync(String(code ?? ""), otp.codeHash)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw fail();
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  const user = await findUserByIdentifier(identifier);
  if (!user || !user.active) throw fail();
  return user;
}
