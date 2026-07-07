import { useState } from "react";
import { api } from "../lib/api";
import { AssignmentTarget, Department, User } from "../lib/types";

interface TargetChip {
  key: string;
  label: string;
  target: AssignmentTarget;
}

interface Props {
  users: User[];
  departments: Department[];
  source?: { id: string; content: string } | null;
  meetingId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const ROLE_GROUPS = [
  { level: "MANAGER", label: "All managers" },
  { level: "DEPT_HEAD", label: "All department heads" },
  { level: "ADMIN", label: "All admins" },
];

export default function TaskModal({ users, departments, source, meetingId, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(source ? source.content.slice(0, 100) : "");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [chips, setChips] = useState<TargetChip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function addChip(chip: TargetChip) {
    setChips((prev) => (prev.some((c) => c.key === chip.key) ? prev : [...prev, chip]));
  }

  async function save() {
    setError(null);
    if (!title.trim()) return setError("Give the task a title");
    if (chips.length === 0) return setError("Pick at least one assignee (person, department, or group)");
    setBusy(true);
    try {
      await api("/api/tasks", {
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          sourceMessageId: source?.id,
          meetingId,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          priority,
          targets: chips.map((c) => c.target),
        },
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Could not create the task");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-800">
          {source ? "Assign message as task" : meetingId ? "Add action item" : "New task"}
        </h2>
        {source && (
          <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            From message: “{source.content.slice(0, 140)}”
          </p>
        )}

        <div className="mt-4 space-y-3">
          <input
            className={inputClass}
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className={inputClass}
            placeholder="Description (optional)"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex gap-3">
            <label className="flex-1 text-xs text-slate-500">
              Due date
              <input
                type="datetime-local"
                className={inputClass}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <label className="flex-1 text-xs text-slate-500">
              Priority
              <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </label>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500">Assign to</p>
            {chips.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={chip.key}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700"
                  >
                    {chip.label}
                    <button
                      onClick={() => setChips((prev) => prev.filter((c) => c.key !== chip.key))}
                      className="text-indigo-400 hover:text-indigo-700"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 grid grid-cols-3 gap-2">
              <select
                className={inputClass}
                value=""
                onChange={(e) => {
                  const user = users.find((u) => u.id === e.target.value);
                  if (user) addChip({ key: `u:${user.id}`, label: user.name, target: { type: "USER", id: user.id } });
                }}
              >
                <option value="">+ Person…</option>
                {users.filter((u) => u.active).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <select
                className={inputClass}
                value=""
                onChange={(e) => {
                  const dept = departments.find((d) => d.id === e.target.value);
                  if (dept)
                    addChip({
                      key: `d:${dept.id}`,
                      label: `${dept.name} (dept)`,
                      target: { type: "DEPARTMENT", id: dept.id },
                    });
                }}
              >
                <option value="">+ Department…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select
                className={inputClass}
                value=""
                onChange={(e) => {
                  const group = ROLE_GROUPS.find((g) => g.level === e.target.value);
                  if (group)
                    addChip({
                      key: `r:${group.level}`,
                      label: group.label,
                      target: { type: "ROLE_LEVEL", level: group.level },
                    });
                }}
              >
                <option value="">+ Group…</option>
                {ROLE_GROUPS.map((g) => (
                  <option key={g.level} value={g.level}>{g.label}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-rose-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Create task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
