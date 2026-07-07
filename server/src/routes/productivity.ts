import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";

export const productivityRouter = Router();

productivityRouter.use(requireAuth);

export interface ProductivityStats {
  assigned: number; // assignments created in the window
  completed: number; // completions in the window
  completedOnTime: number;
  completedWithDueDate: number;
  onTimeRate: number | null; // completedOnTime / completedWithDueDate
  avgCompletionHours: number | null; // createdAt -> completedAt
  openWorkload: number; // currently not completed (any age)
  overdueOpen: number; // open past due right now
  acknowledgedRate: number | null; // of assignments in window
}

function emptyStats(): ProductivityStats {
  return {
    assigned: 0,
    completed: 0,
    completedOnTime: 0,
    completedWithDueDate: 0,
    onTimeRate: null,
    avgCompletionHours: null,
    openWorkload: 0,
    overdueOpen: 0,
    acknowledgedRate: null,
  };
}

interface Accumulator {
  stats: ProductivityStats;
  completionHours: number[];
  ackCount: number;
}

function accumulate(
  acc: Accumulator,
  task: { status: string; dueDate: Date | null; completedAt: Date | null; createdAt: Date; acknowledgedAt: Date | null },
  since: Date,
  now: Date
) {
  const { stats } = acc;
  if (task.createdAt >= since) {
    stats.assigned += 1;
    if (task.acknowledgedAt) acc.ackCount += 1;
  }
  if (task.status === "COMPLETED" && task.completedAt && task.completedAt >= since) {
    stats.completed += 1;
    acc.completionHours.push((task.completedAt.getTime() - task.createdAt.getTime()) / 3_600_000);
    if (task.dueDate) {
      stats.completedWithDueDate += 1;
      if (task.completedAt <= task.dueDate) stats.completedOnTime += 1;
    }
  }
  if (task.status !== "COMPLETED") {
    stats.openWorkload += 1;
    if (task.dueDate && task.dueDate < now) stats.overdueOpen += 1;
  }
}

function finalize(acc: Accumulator): ProductivityStats {
  const { stats } = acc;
  stats.onTimeRate =
    stats.completedWithDueDate > 0 ? stats.completedOnTime / stats.completedWithDueDate : null;
  stats.avgCompletionHours =
    acc.completionHours.length > 0
      ? acc.completionHours.reduce((a, b) => a + b, 0) / acc.completionHours.length
      : null;
  stats.acknowledgedRate = stats.assigned > 0 ? acc.ackCount / stats.assigned : null;
  return stats;
}

productivityRouter.get("/", async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const departmentId = req.query.departmentId ? String(req.query.departmentId) : null;
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 3_600_000);

  const users = await prisma.user.findMany({
    where: { active: true, ...(departmentId ? { departmentId } : {}) },
    select: {
      id: true,
      name: true,
      handle: true,
      roleLevel: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  const userIds = new Set(users.map((u) => u.id));

  const assignments = await prisma.taskAssignee.findMany({
    include: {
      task: {
        select: {
          status: true,
          dueDate: true,
          completedAt: true,
          createdAt: true,
          acknowledgedAt: true,
        },
      },
    },
  });

  const perUser = new Map<string, Accumulator>();
  const perDept = new Map<string, Accumulator>();
  const total: Accumulator = { stats: emptyStats(), completionHours: [], ackCount: 0 };
  const deptOf = new Map(users.map((u) => [u.id, u.departmentId]));

  for (const assignment of assignments) {
    if (!userIds.has(assignment.userId)) continue;
    let acc = perUser.get(assignment.userId);
    if (!acc) {
      acc = { stats: emptyStats(), completionHours: [], ackCount: 0 };
      perUser.set(assignment.userId, acc);
    }
    accumulate(acc, assignment.task, since, now);
    accumulate(total, assignment.task, since, now);

    const deptId = deptOf.get(assignment.userId);
    if (deptId) {
      let deptAcc = perDept.get(deptId);
      if (!deptAcc) {
        deptAcc = { stats: emptyStats(), completionHours: [], ackCount: 0 };
        perDept.set(deptId, deptAcc);
      }
      accumulate(deptAcc, assignment.task, since, now);
    }
  }

  const departments = await prisma.department.findMany({ select: { id: true, name: true } });

  res.json({
    days,
    users: users.map((user) => ({
      user,
      stats: finalize(perUser.get(user.id) ?? { stats: emptyStats(), completionHours: [], ackCount: 0 }),
    })),
    departments: departments
      .filter((d) => !departmentId || d.id === departmentId)
      .map((d) => ({
        department: d,
        stats: finalize(perDept.get(d.id) ?? { stats: emptyStats(), completionHours: [], ackCount: 0 }),
      })),
    totals: finalize(total),
  });
});
