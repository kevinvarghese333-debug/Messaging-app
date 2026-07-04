import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { useShell } from "./Shell";

export default function AdminPage() {
  const { users, refreshUsers, departments, refreshDepartments, refreshChannels } = useShell();
  const [newDept, setNewDept] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    }
  }

  async function addDepartment(e: FormEvent) {
    e.preventDefault();
    if (!newDept.trim()) return;
    await run(async () => {
      await api("/api/departments", { body: { name: newDept.trim() } });
      setNewDept("");
      refreshDepartments();
      refreshChannels();
    });
  }

  const patchUser = (id: string, body: Record<string, unknown>) =>
    run(async () => {
      await api(`/api/users/${id}`, { method: "PATCH", body });
      refreshUsers();
    });

  const selectClass = "rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700";

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-lg font-bold text-slate-800">Admin</h2>
      <p className="text-sm text-slate-500">
        Departments and reporting lines drive @mentions, group task assignment, and overdue-task escalation.
      </p>
      {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <section className="mt-6">
        <h3 className="font-semibold text-slate-700">Departments</h3>
        <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((d) => (
            <div key={d.id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-800">{d.name}</p>
                <span className="text-xs text-slate-400">{d._count?.users ?? 0} people</span>
              </div>
              <label className="mt-2 block text-xs text-slate-500">
                Department head
                <select
                  className={`${selectClass} mt-1 w-full`}
                  value={d.headId ?? ""}
                  onChange={(e) =>
                    run(async () => {
                      await api(`/api/departments/${d.id}`, {
                        method: "PATCH",
                        body: { headId: e.target.value || null },
                      });
                      refreshDepartments();
                      refreshUsers();
                    })
                  }
                >
                  <option value="">— none —</option>
                  {users
                    .filter((u) => u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
              </label>
            </div>
          ))}
        </div>
        <form onSubmit={addDepartment} className="mt-3 flex max-w-sm gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            placeholder="New department name"
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
          />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            Add
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h3 className="font-semibold text-slate-700">People, roles & hierarchy</h3>
        <div className="mt-2 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Role level</th>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5">Reports to</th>
                <th className="px-4 py-2.5">Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50">
                  <td className="px-4 py-2">
                    <p className="font-medium text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-400">@{u.handle} · {u.email}</p>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className={selectClass}
                      value={u.roleLevel}
                      onChange={(e) => patchUser(u.id, { roleLevel: e.target.value })}
                    >
                      <option value="MEMBER">Member</option>
                      <option value="MANAGER">Manager</option>
                      <option value="DEPT_HEAD">Dept head</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className={selectClass}
                      value={u.departmentId ?? ""}
                      onChange={(e) => patchUser(u.id, { departmentId: e.target.value || null })}
                    >
                      <option value="">— none —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className={selectClass}
                      value={u.managerId ?? ""}
                      onChange={(e) => patchUser(u.id, { managerId: e.target.value || null })}
                    >
                      <option value="">— none —</option>
                      {users
                        .filter((m) => m.id !== u.id && m.active)
                        .map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={u.active}
                      onChange={(e) => patchUser(u.id, { active: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
