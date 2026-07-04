import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Task } from "../lib/types";
import Avatar from "../components/Avatar";

interface SearchResults {
  messages: {
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; name: string };
    channel: { id: string; name: string; type: string };
  }[];
  tasks: Task[];
  users: {
    id: string;
    name: string;
    handle: string;
    email: string;
    roleLevel: string;
    department: { id: string; name: string } | null;
  }[];
}

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      setResults(await api<SearchResults>(`/api/search?q=${encodeURIComponent(q.trim())}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <form onSubmit={search} className="flex max-w-xl gap-2">
        <input
          autoFocus
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
          placeholder="Search messages, tasks and people…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {results && (
        <div className="mt-6 max-w-3xl space-y-8">
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Messages ({results.messages.length})
            </h3>
            {results.messages.map((m) => (
              <Link
                key={m.id}
                to={`/channels/${m.channel.id}`}
                className="mt-2 block rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300"
              >
                <p className="text-xs text-slate-400">
                  {m.channel.type === "DM" ? "Direct message" : `#${m.channel.name}`} · {m.author.name} ·{" "}
                  {new Date(m.createdAt).toLocaleString()}
                </p>
                <p className="mt-0.5 text-sm text-slate-700">{m.content}</p>
              </Link>
            ))}
            {results.messages.length === 0 && <p className="mt-1 text-sm text-slate-400">No matches.</p>}
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Tasks ({results.tasks.length})
            </h3>
            {results.tasks.map((t) => (
              <Link
                key={t.id}
                to={`/tasks?taskId=${t.id}`}
                className="mt-2 block rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300"
              >
                <p className="text-sm font-medium text-slate-800">{t.title}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {t.status.replace("_", " ").toLowerCase()} · assigned to{" "}
                  {t.assignees.map((a) => a.user.name).join(", ")}
                </p>
              </Link>
            ))}
            {results.tasks.length === 0 && <p className="mt-1 text-sm text-slate-400">No matches.</p>}
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              People ({results.users.length})
            </h3>
            {results.users.map((u) => (
              <div
                key={u.id}
                className="mt-2 flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200"
              >
                <Avatar name={u.name} />
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {u.name} <span className="text-xs text-slate-400">@{u.handle}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {u.roleLevel.replace("_", " ").toLowerCase()}
                    {u.department ? ` · ${u.department.name}` : ""} · {u.email}
                  </p>
                </div>
              </div>
            ))}
            {results.users.length === 0 && <p className="mt-1 text-sm text-slate-400">No matches.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
