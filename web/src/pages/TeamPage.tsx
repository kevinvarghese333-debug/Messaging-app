import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { User } from "../lib/types";
import { useAuth } from "../state/AuthContext";
import { useShell } from "./Shell";
import Avatar from "../components/Avatar";

type TeamMember = User & { manager?: { id: string; name: string } | null };

export default function TeamPage() {
  const { user } = useAuth();
  const { online, refreshUsers } = useShell();
  const [direct, setDirect] = useState<TeamMember[]>([]);
  const [secondLevel, setSecondLevel] = useState<TeamMember[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  const canInvite = ["MANAGER", "DEPT_HEAD", "ADMIN"].includes(user?.roleLevel ?? "");

  const load = useCallback(() => {
    api<{ direct: TeamMember[]; secondLevel: TeamMember[] }>("/api/users/team")
      .then((r) => {
        setDirect(r.direct);
        setSecondLevel(r.secondLevel);
      })
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function addTeammate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAdded(null);
    setBusy(true);
    try {
      const res = await api<{ user: User }>("/api/users/invite", {
        body: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined },
      });
      setAdded(res.user);
      setName("");
      setPhone("");
      setEmail("");
      load();
      refreshUsers();
    } catch (err: any) {
      setError(err.message ?? "Could not add teammate");
    } finally {
      setBusy(false);
    }
  }

  function MemberRow({ member, showManager }: { member: TeamMember; showManager?: boolean }) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <Avatar name={member.name} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
            {member.name}
            <span className={`h-2 w-2 rounded-full ${online.has(member.id) ? "bg-emerald-400" : "bg-slate-300"}`} />
            {!member.active && (
              <span className="rounded-full bg-slate-200 px-2 text-xs text-slate-500">deactivated</span>
            )}
          </p>
          <p className="truncate text-xs text-slate-400">
            {member.phone ?? "no phone"} · {member.email.endsWith(".local") ? "no email yet" : member.email}
            {member.department ? ` · ${member.department.name}` : ""}
            {showManager && member.manager ? ` · reports to ${member.manager.name}` : ""}
          </p>
        </div>
        <span className="text-xs text-slate-400">{member.roleLevel.replace("_", " ").toLowerCase()}</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-lg font-bold text-slate-800">My team</h2>
      <p className="text-sm text-slate-500">
        People who report to you. Teammates you add here sign in with a one-time code sent to
        their phone number — no password or self-signup needed.
      </p>

      {canInvite && (
        <form onSubmit={addTeammate} className="mt-4 max-w-2xl rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-700">Add a teammate under you</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder="Mobile number (e.g. +91…)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder="Email (optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add teammate"}
            </button>
            {error && <p className="text-sm text-rose-500">{error}</p>}
            {added && (
              <p className="text-sm text-emerald-600">
                {added.name} added — they can log in now with an OTP sent to {added.phone}.
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            They join your department ({user?.department?.name ?? "none"}) reporting to you. You can
            change their role, department, or manager later{user?.roleLevel === "ADMIN" ? " in Admin" : " (ask an admin)"}.
          </p>
        </form>
      )}

      <section className="mt-6 max-w-2xl">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          Direct reports ({direct.length})
        </h3>
        <div className="mt-2 space-y-2">
          {direct.length === 0 && <p className="text-sm text-slate-400">Nobody reports to you yet.</p>}
          {direct.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </div>
      </section>

      {secondLevel.length > 0 && (
        <section className="mt-6 max-w-2xl">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
            Their reports ({secondLevel.length})
          </h3>
          <div className="mt-2 space-y-2">
            {secondLevel.map((m) => (
              <MemberRow key={m.id} member={m} showManager />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
