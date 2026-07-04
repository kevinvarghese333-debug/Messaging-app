import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { extractMentionTokens, mentionedUserIds, resolveMentions } from "../src/services/mentionParser";
import { resolveAssignees } from "../src/services/taskService";
import { runReminderPass } from "../src/services/reminderScheduler";

let eng: { id: string };
let eva: { id: string }; // dept head
let mark: { id: string }; // manager, reports to eva
let dan: { id: string }; // member, reports to mark
let dana: { id: string }; // member, reports to mark

async function makeUser(name: string, handle: string, roleLevel: string, departmentId?: string, managerId?: string) {
  return prisma.user.create({
    data: {
      name,
      handle,
      email: `${handle}@test.local`,
      passwordHash: "x",
      roleLevel,
      departmentId,
      managerId,
    },
  });
}

beforeAll(async () => {
  // Wipe everything (order matters for FK constraints) and build a small org.
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

  eng = await prisma.department.create({ data: { name: "Engineering", slug: "engineering" } });
  eva = await makeUser("Eva", "eva", "DEPT_HEAD", eng.id);
  mark = await makeUser("Mark", "mark", "MANAGER", eng.id, eva.id);
  dan = await makeUser("Dan", "dan", "MEMBER", eng.id, mark.id);
  dana = await makeUser("Dana", "dana", "MEMBER", eng.id, mark.id);
});

beforeEach(async () => {
  await prisma.notification.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
});

describe("mention parsing", () => {
  it("extracts @tokens and ignores emails/punctuation", () => {
    expect(extractMentionTokens("hey @dan, ping @engineering and @managers! mail bob@corp.com")).toEqual([
      "dan",
      "engineering",
      "managers",
    ]);
  });

  it("resolves a user handle to that user", async () => {
    const mentions = await resolveMentions("@dan take a look", null);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].targetType).toBe("USER");
    expect(mentions[0].userIds).toEqual([dan.id]);
  });

  it("resolves a department slug to all its active members", async () => {
    const mentions = await resolveMentions("@engineering standup in 5", null);
    expect(mentions[0].targetType).toBe("DEPARTMENT");
    expect(new Set(mentions[0].userIds)).toEqual(new Set([eva.id, mark.id, dan.id, dana.id]));
  });

  it("resolves @managers scoped to the channel's department", async () => {
    const mentions = await resolveMentions("@managers please approve", { departmentId: eng.id });
    expect(mentions[0].targetType).toBe("ROLE_LEVEL");
    expect(mentions[0].userIds).toEqual([mark.id]);
  });

  it("excludes the author from the notification fan-out", async () => {
    const mentions = await resolveMentions("@engineering hello", null);
    const ids = mentionedUserIds(mentions, eva.id);
    expect(ids).not.toContain(eva.id);
    expect(ids).toHaveLength(3);
  });
});

describe("task assignment fan-out", () => {
  it("expands a department target to every active member with a via label", async () => {
    const assignees = await resolveAssignees([{ type: "DEPARTMENT", id: eng.id }]);
    expect(assignees).toHaveLength(4);
    expect(assignees.every((a) => a.via === "DEPARTMENT" && a.viaLabel === "Engineering")).toBe(true);
  });

  it("deduplicates when a user is targeted directly and via their department", async () => {
    const assignees = await resolveAssignees([
      { type: "DEPARTMENT", id: eng.id },
      { type: "USER", id: dan.id },
    ]);
    expect(assignees).toHaveLength(4);
    expect(assignees.filter((a) => a.userId === dan.id)).toHaveLength(1);
  });

  it("resolves a role level target", async () => {
    const assignees = await resolveAssignees([{ type: "ROLE_LEVEL", level: "MANAGER" }]);
    expect(assignees).toEqual([
      { userId: mark.id, via: "ROLE_LEVEL", viaLabel: "Managers" },
    ]);
  });
});

describe("reminders and escalation", () => {
  function makeTask(opts: { dueInMs: number; acknowledged?: boolean; assigneeId?: string }) {
    return prisma.task.create({
      data: {
        title: "test task",
        assignerId: eva.id,
        dueDate: new Date(Date.now() + opts.dueInMs),
        acknowledgedAt: opts.acknowledged ? new Date() : null,
        assignees: { create: [{ userId: opts.assigneeId ?? dan.id }] },
      },
    });
  }

  it("sends a due-soon reminder once for tasks due within 24h", async () => {
    await makeTask({ dueInMs: 60 * 60 * 1000 }); // due in 1h
    await runReminderPass();
    await runReminderPass(); // second pass must not duplicate
    const reminders = await prisma.notification.findMany({ where: { type: "reminder" } });
    expect(reminders).toHaveLength(1);
    expect(reminders[0].userId).toBe(dan.id);
    expect(reminders[0].title).toContain("due soon");
  });

  it("sends an overdue reminder to assignee and assigner", async () => {
    await makeTask({ dueInMs: -10 * 60 * 1000, acknowledged: true }); // 10min overdue
    await runReminderPass();
    const reminders = await prisma.notification.findMany({ where: { type: "reminder" } });
    expect(new Set(reminders.map((r) => r.userId))).toEqual(new Set([dan.id, eva.id]));
    expect(reminders[0].title).toContain("overdue");
  });

  it("escalates unacknowledged overdue tasks to the assignee's manager", async () => {
    await makeTask({ dueInMs: -2 * 60 * 60 * 1000 }); // 2h overdue, never acknowledged
    await runReminderPass(new Date(), 60 * 60 * 1000); // 1h grace
    const escalations = await prisma.notification.findMany({ where: { type: "escalation" } });
    expect(escalations).toHaveLength(1);
    expect(escalations[0].userId).toBe(mark.id); // Dan's manager
    expect(escalations[0].title).toContain("Dan");
  });

  it("does not escalate acknowledged tasks", async () => {
    await makeTask({ dueInMs: -2 * 60 * 60 * 1000, acknowledged: true });
    await runReminderPass(new Date(), 0);
    const escalations = await prisma.notification.findMany({ where: { type: "escalation" } });
    expect(escalations).toHaveLength(0);
  });

  it("does not escalate before the grace period has passed", async () => {
    await makeTask({ dueInMs: -10 * 60 * 1000 }); // only 10min overdue
    await runReminderPass(new Date(), 60 * 60 * 1000);
    const escalations = await prisma.notification.findMany({ where: { type: "escalation" } });
    expect(escalations).toHaveLength(0);
  });

  it("does not remind about completed tasks", async () => {
    const task = await makeTask({ dueInMs: -60 * 60 * 1000 });
    await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });
    await runReminderPass(new Date(), 0);
    expect(await prisma.notification.count()).toBe(0);
  });
});
