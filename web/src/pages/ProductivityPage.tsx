import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { ProductivityReport, ProductivityStats } from "../lib/types";
import { useShell } from "./Shell";
import Avatar from "../components/Avatar";

// Bar colors validated for CVD separation and surface contrast (dataviz checks).
const COMPLETED_COLOR = "#4f46e5"; // indigo-600
const OPEN_COLOR = "#0891b2"; // cyan-600

function fmtHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function fmtRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function WorkBar({ stats, max }: { stats: ProductivityStats; max: number }) {
  const scale = (n: number) => (max > 0 ? Math.max(n > 0 ? 4 : 0, (n / max) * 100) : 0);
  return (
    <div className="flex h-4 w-full items-center gap-[2px]" role="img"
      aria-label={`${stats.completed} completed, ${stats.openWorkload} open`}>
      <div
        className="h-3 rounded"
        style={{ width: `${scale(stats.completed)}%`, backgroundColor: COMPLETED_COLOR }}
        title={`${stats.completed} completed`}
      />
      <div
        className="h-3 rounded"
        style={{ width: `${scale(stats.openWorkload)}%`, backgroundColor: OPEN_COLOR }}
        title={`${stats.openWorkload} open`}
      />
    </div>
  );
}

export default function ProductivityPage() {
  const { departments } = useShell();
  const [report, setReport] = useState<ProductivityReport | null>(null);
  const [days, setDays] = useState(30);
  const [departmentId, setDepartmentId] = useState("");
  const [sortBy, setSortBy] = useState<"completed" | "onTime" | "open" | "name">("completed");

  const load = useCallback(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (departmentId) params.set("departmentId", departmentId);
    api<ProductivityReport>(`/api/productivity?${params}`).then(setReport).catch(() => {});
  }, [days, departmentId]);

  useEffect(load, [load]);

  const rows = useMemo(() => {
    if (!report) return [];
    const sorted = [...report.users];
    sorted.sort((a, b) => {
      if (sortBy === "name") return a.user.name.localeCompare(b.user.name);
      if (sortBy === "onTime") return (b.stats.onTimeRate ?? -1) - (a.stats.onTimeRate ?? -1);
      if (sortBy === "open") return b.stats.openWorkload - a.stats.openWorkload;
      return b.stats.completed - a.stats.completed;
    });
    return sorted;
  }, [report, sortBy]);

  const maxBar = useMemo(
    () => Math.max(1, ...rows.map((r) => Math.max(r.stats.completed, r.stats.openWorkload))),
    [rows]
  );

  const selectClass = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700";

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
        <h2 className="mr-2 text-base font-bold text-slate-800">Productivity</h2>
        <select className={selectClass} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <select className={selectClass} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select className={selectClass} value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
          <option value="completed">Sort: most completed</option>
          <option value="onTime">Sort: best on-time rate</option>
          <option value="open">Sort: biggest open workload</option>
          <option value="name">Sort: name</option>
        </select>
      </header>

      {report && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={`Completed (${report.days}d)`}
              value={String(report.totals.completed)}
              sub={`${report.totals.assigned} assigned in period`}
            />
            <StatTile
              label="On-time rate"
              value={fmtRate(report.totals.onTimeRate)}
              sub={`of ${report.totals.completedWithDueDate} completed with a due date`}
            />
            <StatTile
              label="Avg completion time"
              value={fmtHours(report.totals.avgCompletionHours)}
              sub="assignment → completed"
            />
            <StatTile
              label="Overdue right now"
              value={String(report.totals.overdueOpen)}
              sub={`${report.totals.openWorkload} tasks open in total`}
            />
          </div>

          {report.departments.length > 1 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {report.departments.map(({ department, stats }) => (
                <div key={department.id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm font-semibold text-slate-700">{department.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {stats.completed} completed · on-time {fmtRate(stats.onTimeRate)} ·{" "}
                    {stats.openWorkload} open
                    {stats.overdueOpen > 0 && (
                      <span className="ml-1 font-semibold text-rose-600">
                        ⚠ {stats.overdueOpen} overdue
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-4 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
              <span className="font-semibold uppercase tracking-wide text-slate-400">Per person</span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COMPLETED_COLOR }} />
                Completed ({report.days}d)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: OPEN_COLOR }} />
                Open now
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-2.5">Person</th>
                  <th className="w-1/4 px-4 py-2.5">Completed vs open</th>
                  <th className="px-4 py-2.5 text-right">Completed</th>
                  <th className="px-4 py-2.5 text-right">On-time</th>
                  <th className="px-4 py-2.5 text-right">Avg time</th>
                  <th className="px-4 py-2.5 text-right">Open</th>
                  <th className="px-4 py-2.5 text-right">Overdue</th>
                  <th className="px-4 py-2.5 text-right">Ack rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ user, stats }) => (
                  <tr key={user.id} className="border-b border-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={user.name} size={6} />
                        <div>
                          <p className="font-medium text-slate-800">{user.name}</p>
                          <p className="text-xs text-slate-400">{user.department?.name ?? "no dept"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <WorkBar stats={stats} max={maxBar} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-700">{stats.completed}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{fmtRate(stats.onTimeRate)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{fmtHours(stats.avgCompletionHours)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{stats.openWorkload}</td>
                    <td className="px-4 py-2.5 text-right">
                      {stats.overdueOpen > 0 ? (
                        <span className="font-semibold text-rose-600">⚠ {stats.overdueOpen}</span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{fmtRate(stats.acknowledgedRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            On-time = completed before its due date (tasks without due dates aren't counted).
            Ack rate = share of tasks assigned in the period that the person acknowledged.
          </p>
        </div>
      )}
    </div>
  );
}
