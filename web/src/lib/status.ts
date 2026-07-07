export const TASK_STATUSES = [
  { value: "NOT_STARTED", label: "Not yet started", chip: "bg-slate-200 text-slate-700" },
  { value: "DECISION_MAKING", label: "Decision making", chip: "bg-violet-100 text-violet-700" },
  { value: "IN_PROGRESS", label: "In progress", chip: "bg-sky-100 text-sky-700" },
  { value: "COMPLETED", label: "Completed", chip: "bg-emerald-100 text-emerald-700" },
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number]["value"];

export function statusLabel(value: string): string {
  return TASK_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export function statusChip(value: string): string {
  return TASK_STATUSES.find((s) => s.value === value)?.chip ?? "bg-slate-100 text-slate-600";
}
