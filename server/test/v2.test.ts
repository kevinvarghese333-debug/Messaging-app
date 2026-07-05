import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { hashPassword, signToken } from "../src/lib/auth";
import { requestOtp, verifyOtp } from "../src/services/otp";

const app = createApp();

let managerToken: string;
let managerId: string;
let memberToken: string;

beforeAll(async () => {
  await prisma.otpCode.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.mention.deleteMany();
  await prisma.message.deleteMany();
  await prisma.channelMember.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.meetingAttendee.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  const dept = await prisma.department.create({ data: { name: "Ops", slug: "ops" } });
  const manager = await prisma.user.create({
    data: {
      name: "Mona Manager",
      handle: "mona",
      email: "mona@test.local",
      phone: "+15551110001",
      passwordHash: hashPassword("password123"),
      roleLevel: "MANAGER",
      departmentId: dept.id,
    },
  });
  managerId = manager.id;
  managerToken = signToken(manager.id);

  const member = await prisma.user.create({
    data: {
      name: "Milo Member",
      handle: "milo",
      email: "milo@test.local",
      phone: "+15551110002",
      passwordHash: hashPassword("password123"),
      roleLevel: "MEMBER",
      departmentId: dept.id,
      managerId: manager.id,
    },
  });
  memberToken = signToken(member.id);
});

/** OTP codes are only printed to the console in dev — capture them there. */
function captureOtpCode(spy: ReturnType<typeof vi.spyOn>): string {
  for (const call of [...(spy.mock.calls as string[][])].reverse()) {
    const match = String(call[0]).match(/:\s(\d{6})\s/);
    if (match) return match[1];
  }
  throw new Error("no OTP code was printed");
}

describe("OTP login", () => {
  it("issues a code and exchanges it for a session", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await requestOtp("+1 555 111 0002"); // formatting is normalized away
    const code = captureOtpCode(spy);
    spy.mockRestore();

    const user = await verifyOtp("+15551110002", code);
    expect(user.email).toBe("milo@test.local");

    // A consumed code cannot be replayed.
    await expect(verifyOtp("+15551110002", code)).rejects.toThrow("Invalid or expired");
  });

  it("works via the HTTP endpoints with an email identifier", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const reqRes = await request(app).post("/api/auth/otp/request").send({ identifier: "MONA@test.local" });
    expect(reqRes.status).toBe(200);
    const code = captureOtpCode(spy);
    spy.mockRestore();

    const bad = await request(app)
      .post("/api/auth/otp/verify")
      .send({ identifier: "mona@test.local", code: "000000" });
    expect(bad.status).toBe(401);

    const ok = await request(app)
      .post("/api/auth/otp/verify")
      .send({ identifier: "mona@test.local", code });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect(ok.body.user.handle).toBe("mona");
  });

  it("reports success for unknown identifiers without creating codes", async () => {
    const before = await prisma.otpCode.count();
    const res = await request(app).post("/api/auth/otp/request").send({ identifier: "+19999999999" });
    expect(res.status).toBe(200);
    expect(await prisma.otpCode.count()).toBe(before);
  });

  it("rate-limits repeated requests", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await requestOtp("+15551110001");
    await requestOtp("+15551110001");
    await requestOtp("+15551110001");
    spy.mockRestore();
    await expect(requestOtp("+15551110001")).rejects.toThrow("Too many codes");
  });
});

describe("team invites", () => {
  it("lets a manager add a teammate by phone who can then log in via OTP", async () => {
    const res = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ name: "Priya Kumar", phone: "+91 98765 43210" });
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe("+919876543210");
    expect(res.body.user.managerId).toBe(managerId);

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await requestOtp("+919876543210");
    const code = captureOtpCode(spy);
    spy.mockRestore();
    const user = await verifyOtp("+919876543210", code);
    expect(user.name).toBe("Priya Kumar");

    // Invited users have no password — password login is rejected with guidance.
    const pw = await request(app)
      .post("/api/auth/login")
      .send({ email: res.body.user.email, password: "whatever123" });
    expect(pw.status).toBe(401);
  });

  it("rejects duplicate phones and non-manager inviters", async () => {
    const dup = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ name: "Copy Cat", phone: "+919876543210" });
    expect(dup.status).toBe(409);

    const forbidden = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "Sneaky", phone: "+15559998888" });
    expect(forbidden.status).toBe(403);
  });
});

describe("productivity report", () => {
  it("aggregates completions, on-time rate, and open workload per user", async () => {
    const now = Date.now();
    const hour = 3_600_000;
    const milo = await prisma.user.findUniqueOrThrow({ where: { email: "milo@test.local" } });

    const mk = (data: Record<string, unknown>) =>
      prisma.task.create({
        data: {
          title: "fixture",
          assignerId: managerId,
          assignees: { create: [{ userId: milo.id }] },
          ...data,
        } as any,
      });

    await mk({ status: "COMPLETED", dueDate: new Date(now + hour), completedAt: new Date(now - hour), acknowledgedAt: new Date() }); // on time
    await mk({ status: "COMPLETED", dueDate: new Date(now - 3 * hour), completedAt: new Date(now - hour) }); // late
    await mk({ status: "IN_PROGRESS", dueDate: new Date(now - hour) }); // open + overdue
    await mk({ status: "NOT_STARTED" }); // open, no due date

    const res = await request(app)
      .get("/api/productivity?days=30")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);

    const row = res.body.users.find((u: any) => u.user.id === milo.id);
    expect(row.stats.completed).toBe(2);
    expect(row.stats.completedWithDueDate).toBe(2);
    expect(row.stats.completedOnTime).toBe(1);
    expect(row.stats.onTimeRate).toBeCloseTo(0.5);
    expect(row.stats.openWorkload).toBe(2);
    expect(row.stats.overdueOpen).toBe(1);
    expect(row.stats.assigned).toBe(4);
    expect(row.stats.acknowledgedRate).toBeCloseTo(0.25);
  });
});
