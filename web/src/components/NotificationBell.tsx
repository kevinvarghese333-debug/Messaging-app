import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { Notification } from "../lib/types";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  function refresh() {
    api<{ notifications: Notification[]; unreadCount: number }>("/api/notifications")
      .then((r) => {
        setItems(r.notifications);
        setUnread(r.unreadCount);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refresh();
    const socket = getSocket();
    if (!socket) return;
    const onNew = (n: Notification) => {
      setItems((prev) => [n, ...prev].slice(0, 50));
      setUnread((u) => u + 1);
    };
    socket.on("notification:new", onNew);
    return () => {
      socket.off("notification:new", onNew);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await api("/api/notifications/read", { body: {} });
      setUnread(0);
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggle}
        className="relative rounded-md p-1.5 text-slate-300 hover:bg-slate-800"
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl bg-white shadow-2xl ring-1 ring-slate-200">
          <p className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
            Notifications
          </p>
          {items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Nothing yet</p>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setOpen(false);
                if (n.link) navigate(n.link);
              }}
              className={`block w-full border-b border-slate-50 px-4 py-2.5 text-left hover:bg-slate-50 ${
                n.readAt ? "" : "bg-indigo-50/50"
              }`}
            >
              <p className="text-sm text-slate-800">{n.title}</p>
              {n.body && <p className="mt-0.5 truncate text-xs text-slate-500">{n.body}</p>}
              <p className="mt-0.5 text-xs text-slate-400">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
