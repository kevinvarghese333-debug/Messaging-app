import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Meeting } from "../lib/types";
import { useAuth } from "../state/AuthContext";
import { useShell } from "./Shell";
import Avatar from "../components/Avatar";
import TaskModal from "../components/TaskModal";
import { statusLabel } from "../lib/status";

function CreateMeetingModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { users, departments } = useShell();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500";

  async function save() {
    setError(null);
    if (!title.trim() || !startsAt || !endsAt) return setError("Title, start and end are required");
    setBusy(true);
    try {
      await api("/api/meetings", {
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          location: location.trim() || undefined,
          attendeeIds,
          departmentIds,
        },
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Could not schedule the meeting");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-800">Schedule a meeting</h2>
        <div className="mt-4 space-y-3">
          <input className={inputClass} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className={inputClass}
            placeholder="Agenda / description (optional)"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex gap-3">
            <label className="flex-1 text-xs text-slate-500">
              Starts
              <input type="datetime-local" className={inputClass} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label className="flex-1 text-xs text-slate-500">
              Ends
              <input type="datetime-local" className={inputClass} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </label>
          </div>
          <input
            className={inputClass}
            placeholder="Location or link (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />

          <div>
            <p className="text-xs font-semibold text-slate-500">Invite people</p>
            <div className="mt-1 grid max-h-32 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {users
                .filter((u) => u.active && u.id !== user?.id)
                .map((u) => (
                  <label key={u.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={attendeeIds.includes(u.id)}
                      onChange={(e) =>
                        setAttendeeIds((prev) =>
                          e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                        )
                      }
                    />
                    {u.name}
                  </label>
                ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">Invite whole departments</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={departmentIds.includes(d.id)}
                    onChange={(e) =>
                      setDepartmentIds((prev) =>
                        e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id)
                      )
                    }
                  />
                  {d.name}
                </label>
              ))}
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
              {busy ? "Saving…" : "Schedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  const { user } = useAuth();
  const { users, departments } = useShell();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [creating, setCreating] = useState(false);
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ meetings: Meeting[] }>(`/api/meetings?scope=${scope}`)
      .then((r) => setMeetings(r.meetings))
      .catch(() => {});
  }, [scope]);

  useEffect(load, [load]);

  async function respond(meetingId: string, response: string) {
    await api(`/api/meetings/${meetingId}/respond`, { body: { response } });
    load();
  }
  async function cancel(meetingId: string) {
    await api(`/api/meetings/${meetingId}`, { method: "DELETE" });
    load();
  }

  const now = new Date();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <h2 className="text-base font-bold text-slate-800">Meetings</h2>
        <select
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700"
          value={scope}
          onChange={(e) => setScope(e.target.value as any)}
        >
          <option value="mine">My meetings</option>
          <option value="all">All meetings</option>
        </select>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          + Schedule meeting
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {meetings.length === 0 && (
          <p className="pt-10 text-center text-sm text-slate-400">No meetings scheduled.</p>
        )}
        {meetings.map((meeting) => {
          const past = new Date(meeting.endsAt) < now;
          const mine = meeting.attendees.find((a) => a.userId === user?.id);
          return (
            <div
              key={meeting.id}
              className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${past ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{meeting.title}</p>
                  <p className="text-sm text-slate-500">
                    {new Date(meeting.startsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    {" – "}
                    {new Date(meeting.endsAt).toLocaleTimeString([], { timeStyle: "short" })}
                    {meeting.location && ` · ${meeting.location}`}
                  </p>
                  {meeting.description && (
                    <p className="mt-1 text-sm text-slate-500">{meeting.description}</p>
                  )}
                </div>
                {meeting.organizerId === user?.id && !past && (
                  <button
                    onClick={() => cancel(meeting.id)}
                    className="text-xs text-slate-400 hover:text-rose-500"
                  >
                    Cancel meeting
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-400">Organized by {meeting.organizer.name} ·</span>
                {meeting.attendees.map((a) => (
                  <span
                    key={a.id}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                      a.response === "ACCEPTED"
                        ? "bg-emerald-100 text-emerald-700"
                        : a.response === "DECLINED"
                        ? "bg-rose-100 text-rose-600 line-through"
                        : "bg-slate-100 text-slate-600"
                    }`}
                    title={a.response.toLowerCase()}
                  >
                    {a.user.name}
                  </span>
                ))}
              </div>

              {mine && !past && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => respond(meeting.id, "ACCEPTED")}
                    disabled={mine.response === "ACCEPTED"}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respond(meeting.id, "DECLINED")}
                    disabled={mine.response === "DECLINED"}
                    className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
                  >
                    Decline
                  </button>
                </div>
              )}

              <div className="mt-3 border-t border-slate-100 pt-2">
                <p className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  Action items
                  <button
                    onClick={() => setAddingItemFor(meeting.id)}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    + Add action item
                  </button>
                </p>
                {meeting.actionItems.length === 0 && (
                  <p className="mt-1 text-xs text-slate-400">None yet.</p>
                )}
                {meeting.actionItems.map((task) => (
                  <div key={task.id} className="mt-1.5 flex items-center gap-2 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        task.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {statusLabel(task.status)}
                    </span>
                    <span className={task.status === "COMPLETED" ? "text-slate-400 line-through" : "text-slate-700"}>
                      {task.title}
                    </span>
                    <span className="flex items-center gap-1">
                      {task.assignees.map((a) => (
                        <Avatar key={a.id} name={a.user.name} size={6} />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {creating && <CreateMeetingModal onClose={() => setCreating(false)} onSaved={load} />}
      {addingItemFor && (
        <TaskModal
          users={users}
          departments={departments}
          meetingId={addingItemFor}
          onClose={() => setAddingItemFor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
