import { prisma } from "../lib/prisma";
import { notify } from "./notifier";

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000; // remind 24h before due
const MEETING_REMINDER_MS = 15 * 60 * 1000; // remind 15min before start
const ESCALATION_GRACE_MS = Number(process.env.ESCALATION_GRACE_MS ?? 60 * 60 * 1000); // 1h overdue

async function alreadySent(taskId: string, kind: string) {
  const marker = await prisma.reminder.findUnique({ where: { taskId_kind: { taskId, kind } } });
  return !!marker;
}

async function markSent(taskId: string, kind: string) {
  await prisma.reminder.create({ data: { taskId, kind } }).catch(() => {});
}

/**
 * One scheduler pass. Exported separately from start() so tests can drive it
 * with a fixed clock and grace period.
 */
export async function runReminderPass(now = new Date(), escalationGraceMs = ESCALATION_GRACE_MS) {
  const openWithDue = await prisma.task.findMany({
    where: { status: { not: "COMPLETED" }, dueDate: { not: null } },
    include: {
      assignees: { include: { user: { select: { id: true, name: true, managerId: true } } } },
      assigner: { select: { id: true, name: true } },
    },
  });

  for (const task of openWithDue) {
    const due = task.dueDate!;
    const assigneeIds = task.assignees.map((a) => a.userId);
    const dueLabel = due.toISOString().replace("T", " ").slice(0, 16);

    if (due > now && due.getTime() - now.getTime() <= DUE_SOON_WINDOW_MS) {
      if (!(await alreadySent(task.id, "DUE_SOON"))) {
        await notify(assigneeIds, {
          type: "reminder",
          title: `Task due soon: ${task.title}`,
          body: `Due ${dueLabel}`,
          link: `/tasks?taskId=${task.id}`,
        });
        await markSent(task.id, "DUE_SOON");
      }
    }

    if (due <= now) {
      if (!(await alreadySent(task.id, "OVERDUE"))) {
        await notify([...assigneeIds, task.assignerId], {
          type: "reminder",
          title: `Task overdue: ${task.title}`,
          body: `Was due ${dueLabel}`,
          link: `/tasks?taskId=${task.id}`,
        });
        await markSent(task.id, "OVERDUE");
      }

      // Escalate to each assignee's manager when overdue past the grace period
      // and the assignee never acknowledged the task.
      const overdueFor = now.getTime() - due.getTime();
      if (!task.acknowledgedAt && overdueFor >= escalationGraceMs) {
        if (!(await alreadySent(task.id, "ESCALATION"))) {
          const managerToAssignees = new Map<string, string[]>();
          for (const assignee of task.assignees) {
            const managerId = assignee.user.managerId;
            if (!managerId || assigneeIds.includes(managerId)) continue;
            const names = managerToAssignees.get(managerId) ?? [];
            names.push(assignee.user.name);
            managerToAssignees.set(managerId, names);
          }
          for (const [managerId, names] of managerToAssignees) {
            await notify([managerId], {
              type: "escalation",
              title: `Escalation: unacknowledged overdue task for ${names.join(", ")}`,
              body: `"${task.title}" was due ${dueLabel} and has not been acknowledged.`,
              link: `/tasks?taskId=${task.id}`,
            });
          }
          await markSent(task.id, "ESCALATION");
        }
      }
    }
  }

  // Meeting reminders shortly before start.
  const upcoming = await prisma.meeting.findMany({
    where: {
      reminderSentAt: null,
      startsAt: { gt: now, lte: new Date(now.getTime() + MEETING_REMINDER_MS) },
    },
    include: { attendees: true },
  });
  for (const meeting of upcoming) {
    await notify(
      [...meeting.attendees.map((a) => a.userId), meeting.organizerId],
      {
        type: "meeting_reminder",
        title: `Meeting starting soon: ${meeting.title}`,
        body: `Starts ${meeting.startsAt.toISOString().replace("T", " ").slice(0, 16)}`,
        link: `/meetings`,
      }
    );
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { reminderSentAt: now },
    });
  }
}

let timer: NodeJS.Timeout | null = null;

export function startReminderScheduler(intervalMs = 60_000) {
  if (timer) return;
  timer = setInterval(() => {
    runReminderPass().catch((err) => console.error("[reminders] pass failed:", err));
  }, intervalMs);
  timer.unref();
  console.log(`[reminders] scheduler running every ${Math.round(intervalMs / 1000)}s`);
}
