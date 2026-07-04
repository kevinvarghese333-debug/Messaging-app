import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";
import { createTask, emitTaskUpdate, taskInclude } from "../services/taskService";
import { notify } from "../services/notifier";

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

tasksRouter.post("/", async (req, res) => {
  const { title, description, sourceMessageId, dueDate, priority, meetingId, targets } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title is required" });
  if (!Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ error: "At least one assignee target is required" });
  }
  if (sourceMessageId) {
    const existing = await prisma.task.findUnique({ where: { sourceMessageId } });
    if (existing) return res.status(409).json({ error: "This message is already a task" });
  }
  try {
    const task = await createTask(req.user.id, {
      title: String(title),
      description: description ? String(description) : undefined,
      sourceMessageId: sourceMessageId || undefined,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority || "MEDIUM",
      meetingId: meetingId || undefined,
      targets,
    });
    res.json({ task });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Could not create task" });
  }
});

tasksRouter.get("/", async (req, res) => {
  const { view = "all", status, departmentId, assigneeId } = req.query as Record<string, string>;
  const userId = req.user.id;

  const where: any = {};
  if (view === "mine") where.assignees = { some: { userId } };
  else if (view === "assigned-by-me") where.assignerId = userId;
  if (status) where.status = status;
  if (assigneeId) where.assignees = { some: { userId: assigneeId } };
  if (departmentId) {
    where.assignees = {
      some: {
        ...(assigneeId ? { userId: assigneeId } : {}),
        user: { departmentId },
      },
    };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: taskInclude,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
  res.json({ tasks });
});

tasksRouter.get("/:id", async (req, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: taskInclude });
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task });
});

function canEditTask(task: { assignerId: string; assignees: { userId: string }[] }, user: { id: string; roleLevel: string }) {
  return (
    user.roleLevel === "ADMIN" ||
    task.assignerId === user.id ||
    task.assignees.some((a) => a.userId === user.id)
  );
}

tasksRouter.patch("/:id", async (req, res) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { assignees: true },
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (!canEditTask(task, req.user)) return res.status(403).json({ error: "Not allowed" });

  const { title, description, status, priority, dueDate } = req.body ?? {};
  const dueDateChanged = dueDate !== undefined;

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      ...(title !== undefined ? { title: String(title) } : {}),
      ...(description !== undefined ? { description: description ? String(description) : null } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(dueDateChanged ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
    },
    include: taskInclude,
  });

  // A new due date means the reminder cycle starts over.
  if (dueDateChanged) {
    await prisma.reminder.deleteMany({ where: { taskId: task.id } });
  }

  if (status !== undefined && status !== task.status) {
    const interested = [updated.assignerId, ...updated.assignees.map((a) => a.userId)].filter(
      (id) => id !== req.user.id
    );
    await notify(interested, {
      type: "task_updated",
      title: `${req.user.name} moved "${updated.title}" to ${String(status).replace("_", " ").toLowerCase()}`,
      link: `/tasks?taskId=${updated.id}`,
    });
  }

  emitTaskUpdate(updated);
  res.json({ task: updated });
});

// Assignee confirms they've seen the task — stops manager escalation.
tasksRouter.post("/:id/ack", async (req, res) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { assignees: true },
  });
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (!task.assignees.some((a) => a.userId === req.user.id)) {
    return res.status(403).json({ error: "Only an assignee can acknowledge a task" });
  }
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { acknowledgedAt: task.acknowledgedAt ?? new Date() },
    include: taskInclude,
  });
  emitTaskUpdate(updated);
  res.json({ task: updated });
});
