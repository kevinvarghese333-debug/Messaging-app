import { prisma } from "../lib/prisma";
import { notify } from "./notifier";
import { emitToUsers } from "../realtime/io";

export interface AssignmentTarget {
  type: "USER" | "DEPARTMENT" | "ROLE_LEVEL";
  id?: string; // userId or departmentId
  level?: string; // for ROLE_LEVEL: MANAGER | DEPT_HEAD | ADMIN | MEMBER
  departmentId?: string; // optional scope for ROLE_LEVEL
}

export interface ResolvedAssignee {
  userId: string;
  via: "DIRECT" | "DEPARTMENT" | "ROLE_LEVEL";
  viaLabel: string | null;
}

/** Expand assignment targets (people, departments, role levels) to concrete users. */
export async function resolveAssignees(targets: AssignmentTarget[]): Promise<ResolvedAssignee[]> {
  const byUser = new Map<string, ResolvedAssignee>();

  for (const target of targets) {
    if (target.type === "USER" && target.id) {
      if (!byUser.has(target.id)) {
        byUser.set(target.id, { userId: target.id, via: "DIRECT", viaLabel: null });
      } else {
        // direct assignment wins over group-derived assignment
        byUser.set(target.id, { userId: target.id, via: "DIRECT", viaLabel: null });
      }
    } else if (target.type === "DEPARTMENT" && target.id) {
      const department = await prisma.department.findUnique({
        where: { id: target.id },
        include: { users: { where: { active: true }, select: { id: true } } },
      });
      if (!department) continue;
      for (const user of department.users) {
        if (!byUser.has(user.id)) {
          byUser.set(user.id, { userId: user.id, via: "DEPARTMENT", viaLabel: department.name });
        }
      }
    } else if (target.type === "ROLE_LEVEL" && target.level) {
      const users = await prisma.user.findMany({
        where: {
          active: true,
          roleLevel: target.level,
          ...(target.departmentId ? { departmentId: target.departmentId } : {}),
        },
        select: { id: true },
      });
      const label = target.level === "DEPT_HEAD" ? "Department heads" : `${target.level.charAt(0)}${target.level.slice(1).toLowerCase()}s`;
      for (const user of users) {
        if (!byUser.has(user.id)) {
          byUser.set(user.id, { userId: user.id, via: "ROLE_LEVEL", viaLabel: label });
        }
      }
    }
  }

  return [...byUser.values()];
}

export const taskInclude = {
  assigner: { select: { id: true, name: true, handle: true } },
  assignees: { include: { user: { select: { id: true, name: true, handle: true, departmentId: true } } } },
  sourceMessage: { select: { id: true, channelId: true, content: true } },
  meeting: { select: { id: true, title: true, startsAt: true } },
} as const;

export interface CreateTaskInput {
  title: string;
  description?: string;
  sourceMessageId?: string;
  dueDate?: Date | null;
  priority?: string;
  meetingId?: string;
  targets: AssignmentTarget[];
}

export async function createTask(assignerId: string, input: CreateTaskInput) {
  const assignees = await resolveAssignees(input.targets);
  if (assignees.length === 0) throw new Error("Task must have at least one assignee");

  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      sourceMessageId: input.sourceMessageId,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? "MEDIUM",
      meetingId: input.meetingId,
      assignerId,
      assignees: {
        create: assignees.map((a) => ({ userId: a.userId, via: a.via, viaLabel: a.viaLabel })),
      },
    },
    include: taskInclude,
  });

  const assigner = task.assigner;
  const due = task.dueDate ? ` (due ${task.dueDate.toISOString().slice(0, 10)})` : "";
  await notify(
    assignees.map((a) => a.userId).filter((id) => id !== assignerId),
    {
      type: "task_assigned",
      title: `${assigner.name} assigned you a task: ${task.title}`,
      body: `Priority ${task.priority}${due}`,
      link: `/tasks?taskId=${task.id}`,
    }
  );

  emitTaskUpdate(task);
  return task;
}

export function emitTaskUpdate(task: { id: string; assignerId: string; assignees: { userId: string }[] }) {
  const userIds = [task.assignerId, ...task.assignees.map((a) => a.userId)];
  emitToUsers(userIds, "task:updated", { taskId: task.id });
}
