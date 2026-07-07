import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

let adminToken: string;
let memberToken: string;
let memberId: string;

beforeAll(async () => {
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
});

describe("auth and org API", () => {
  it("makes the first registered user an admin", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada Admin", email: "ada@test.local", phone: "+15550000001", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.user.roleLevel).toBe("ADMIN");
    adminToken = res.body.token;
  });

  it("rejects registration without a phone number", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "No Phone", email: "nophone@test.local", password: "password123" });
    expect(res.status).toBe(400);
  });

  it("registers subsequent users as members with unique handles", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada Admin", email: "ada2@test.local", phone: "+15550000002", password: "password123" });
    expect(res.body.user.roleLevel).toBe("MEMBER");
    expect(res.body.user.handle).not.toBe("ada.admin"); // deduped
    memberToken = res.body.token;
    memberId = res.body.user.id;
  });

  it("rejects bad credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ada@test.local", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("lets only admins create departments", async () => {
    const forbidden = await request(app)
      .post("/api/departments")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "Design" });
    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .post("/api/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Design" });
    expect(ok.status).toBe(200);
    expect(ok.body.department.slug).toBe("design");
  });
});

describe("messaging and tasks API", () => {
  let channelId: string;
  let messageId: string;

  it("creates a channel and posts a message with a mention", async () => {
    const channel = await request(app)
      .post("/api/channels")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "war-room" });
    channelId = channel.body.channel.id;

    const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    const res = await request(app)
      .post(`/api/channels/${channelId}/messages`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: `@${member.handle} please look into the outage` });
    expect(res.status).toBe(200);
    expect(res.body.message.mentions).toHaveLength(1);
    messageId = res.body.message.id;

    const notifications = await prisma.notification.findMany({ where: { userId: memberId, type: "mention" } });
    expect(notifications).toHaveLength(1);
  });

  it("assigns the message as a task and notifies the assignee", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Investigate the outage",
        sourceMessageId: messageId,
        priority: "URGENT",
        targets: [{ type: "USER", id: memberId }],
      });
    expect(res.status).toBe(200);
    expect(res.body.task.assignees[0].userId).toBe(memberId);

    const assigned = await prisma.notification.findMany({ where: { userId: memberId, type: "task_assigned" } });
    expect(assigned).toHaveLength(1);

    // The same message cannot become two tasks.
    const dup = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "again", sourceMessageId: messageId, targets: [{ type: "USER", id: memberId }] });
    expect(dup.status).toBe(409);
  });

  it("lets the assignee acknowledge and complete the task", async () => {
    const { body } = await request(app)
      .get("/api/tasks?view=mine")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(body.tasks).toHaveLength(1);
    const taskId = body.tasks[0].id;

    const ack = await request(app)
      .post(`/api/tasks/${taskId}/ack`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({});
    expect(ack.body.task.acknowledgedAt).toBeTruthy();

    const decision = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ status: "DECISION_MAKING" });
    expect(decision.body.task.status).toBe("DECISION_MAKING");
    expect(decision.body.task.completedAt).toBeNull();

    const done = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ status: "COMPLETED" });
    expect(done.body.task.status).toBe("COMPLETED");
    expect(done.body.task.completedAt).toBeTruthy();

    const invalid = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ status: "DONE" });
    expect(invalid.status).toBe(400);
  });

  it("blocks strangers from private channels", async () => {
    const priv = await request(app)
      .post("/api/channels")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "secret", type: "PRIVATE" });
    const res = await request(app)
      .get(`/api/channels/${priv.body.channel.id}/messages`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });
});
