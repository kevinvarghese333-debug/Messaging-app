import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { Task } from "../lib/types";
import { useAuth } from "../state/AuthContext";
import { useShell } from "./Shell";
import Avatar from "../components/Avatar";
import TaskModal from "../components/TaskModal";

const PRIORITY_STYLE: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-sky-100 text-sky-700",
  HIGH: "bg-amber-100 text-amber-700",
  URGENT: "bg-rose-100 text-rose-700",
};

function TaskCard({
  task,
  highlight,
  onChanged,
}: {
  task: Task;
  highlight: boolean;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const isAssignee = task.assignees.some((a) => a.userId === user?.id);
  const canEdit = isAssignee || task.assignerId === user?.id || user?.roleLevel === "ADMIN";
  const overdue = task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < new Date();

  async function setStatus(status: string) {
    await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { status } });
    onChanged();
  }
  async function acknowledge() {
    await api(`/api/tasks/${task.id}/ack`, { body: {} });
    onChanged();
  }

  return (
    <div
      id={`task-${task.id}`}
      className={`rounded-xl bg-white p-4 shadow-sm ring-1 ${
        highlight ? "ring-2 ring-indigo-500" : "ring-slate-200"
      } ${task.status === "DONE" ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold text-slate-800 ${task.status === "DONE" ? "line-through" : ""}`}>
            {task.title}
          </p>
          {task.description && <p className="mt-0.5 text-sm text-slate-500">{task.description}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLE[task.priority]}`}>
          {task.priority.toLowerCase()}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          by <span className="font-medium text-slate-700">{task.assigner.name}</span>
        </span>
        {task.dueDate && (
          <span className={overdue ? "font-semibold text-rose-600" : ""}>
            · due {new Date(task.dueDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
            {overdue ? " (overdue)" : ""}
          </span>
        )}
        {task.sourceMessage && (
          <Link
            to={`/channels/${task.sourceMessage.channelId}`}
            className="text-indigo-600 hover:underline"
          >
            · from message
          </Link>
        )}
        {task.meeting && <span>· 📅 {task.meeting.title}</span>}
        {isAssignee && !task.acknowledgedAt && task.status !== "DONE" && (
          <button
            onClick={acknowledge}
            className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700 hover:bg-amber-200"
            title="Confirm you've seen this task — stops manager escalation"
          >
            Acknowledge
          </button>
        )}
        {task.acknowledgedAt && <span className="text-emerald-600">· acknowledged</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {task.assignees.map((a) => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs text-slate-700"
            title={a.viaLabel ? `via ${a.viaLabel}` : "assigned directly"}
          >
            <Avatar name={a.user.name} size={6} />
            {a.user.name}
            {a.viaLabel && <span className="text-slate-400">({a.viaLabel})</span>}
          </span>
        ))}
        {canEdit && (
          <select
            className="ml-auto rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"
            value={task.status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="DONE">Done</option>
          </select>
        )}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { user } = useAuth();
  const { users, departments } = useShell();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("taskId");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<"mine" | "assigned-by-me" | "all">("mine");
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [groupByAssignee, setGroupByAssignee] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams({ view });
    if (status) params.set("status", status);
    if (departmentId) params.set("departmentId", departmentId);
    if (assigneeId) params.set("assigneeId", assigneeId);
    api<{ tasks: Task[] }>(`/api/tasks?${params}`).then((r) => setTasks(r.tasks)).catch(() => {});
  }, [view, status, departmentId, assigneeId]);

  useEffect(load, [load]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on("task:updated", load);
    return () => {
      socket.off("task:updated", load);
    };
  }, [load]);

  useEffect(() => {
    if (highlightId && tasks.length > 0) {
      setView("all");
      document.getElementById(`task-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, tasks.length]);

  const grouped = useMemo(() => {
    if (!groupByAssignee) return null;
    const map = new Map<string, { name: string; tasks: Task[] }>();
    for (const task of tasks) {
      for (const a of task.assignees) {
        const entry = map.get(a.userId) ?? { name: a.user.name, tasks: [] };
        entry.tasks.push(task);
        map.set(a.userId, entry);
      }
    }
    return [...map.entries()].sort((x, y) => x[1].name.localeCompare(y[1].name));
  }, [tasks, groupByAssignee]);

  const selectClass = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700";

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
        <h2 className="mr-2 text-base font-bold text-slate-800">Tasks</h2>
        <select className={selectClass} value={view} onChange={(e) => setView(e.target.value as any)}>
          <option value="mine">My tasks</option>
          <option value="assigned-by-me">Assigned by me</option>
          <option value="all">Everyone (who's assigned what)</option>
        </select>
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="DONE">Done</option>
        </select>
        <select className={selectClass} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">Any department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select className={selectClass} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">Any assignee</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={groupByAssignee}
            onChange={(e) => setGroupByAssignee(e.target.checked)}
          />
          Group by assignee
        </label>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          + New task
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {tasks.length === 0 && (
          <p className="pt-10 text-center text-sm text-slate-400">No tasks match these filters.</p>
        )}
        {grouped
          ? grouped.map(([userId, group]) => (
              <div key={userId}>
                <p className="mb-2 mt-4 flex items-center gap-2 text-sm font-bold text-slate-700">
                  <Avatar name={group.name} size={6} /> {group.name}
                  <span className="font-normal text-slate-400">
                    {group.tasks.filter((t) => t.status !== "DONE").length} open ·{" "}
                    {group.tasks.filter((t) => t.status === "DONE").length} done
                  </span>
                </p>
                <div className="space-y-3">
                  {group.tasks.map((t) => (
                    <TaskCard key={`${userId}:${t.id}`} task={t} highlight={t.id === highlightId} onChanged={load} />
                  ))}
                </div>
              </div>
            ))
          : tasks.map((t) => (
              <TaskCard key={t.id} task={t} highlight={t.id === highlightId} onChanged={load} />
            ))}
      </div>

      {creating && (
        <TaskModal
          users={users}
          departments={departments}
          onClose={() => setCreating(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
