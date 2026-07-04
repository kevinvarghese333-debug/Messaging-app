const COLORS = [
  "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-lime-600",
  "bg-emerald-500", "bg-teal-500", "bg-sky-500", "bg-indigo-500",
  "bg-violet-500", "bg-fuchsia-500",
];

export default function Avatar({ name, size = 8 }: { name: string; size?: 6 | 8 | 10 }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const color = COLORS[Math.abs(hash) % COLORS.length];
  const sizeClass = size === 6 ? "h-6 w-6 text-[10px]" : size === 10 ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${color} ${sizeClass}`}
    >
      {initials}
    </span>
  );
}
