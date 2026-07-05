import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { Channel, Department, User } from "../lib/types";
import { useAuth } from "../state/AuthContext";
import Avatar from "../components/Avatar";
import NotificationBell from "../components/NotificationBell";

export interface ShellContext {
  channels: Channel[];
  refreshChannels: () => void;
  users: User[];
  refreshUsers: () => void;
  departments: Department[];
  refreshDepartments: () => void;
  online: Set<string>;
}

export function useShell() {
  return useOutletContext<ShellContext>();
}

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());

  const refreshChannels = useCallback(() => {
    api<{ channels: Channel[] }>("/api/channels").then((r) => setChannels(r.channels)).catch(() => {});
  }, []);
  const refreshUsers = useCallback(() => {
    api<{ users: User[]; online: string[] }>("/api/users")
      .then((r) => {
        setUsers(r.users);
        setOnline(new Set(r.online));
      })
      .catch(() => {});
  }, []);
  const refreshDepartments = useCallback(() => {
    api<{ departments: Department[] }>("/api/departments")
      .then((r) => setDepartments(r.departments))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshChannels();
    refreshUsers();
    refreshDepartments();
  }, [refreshChannels, refreshUsers, refreshDepartments]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onPresence = ({ userId, online: isOnline }: { userId: string; online: boolean }) => {
      setOnline((prev) => {
        const next = new Set(prev);
        if (isOnline) next.add(userId);
        else next.delete(userId);
        return next;
      });
    };
    const onMessage = () => refreshChannels();
    socket.on("presence", onPresence);
    socket.on("message:new", onMessage);
    socket.emit("presence:list", (ids: string[]) => setOnline(new Set(ids)));
    return () => {
      socket.off("presence", onPresence);
      socket.off("message:new", onMessage);
    };
  }, [refreshChannels]);

  async function openDm(otherId: string) {
    const { channel } = await api<{ channel: { id: string } }>("/api/channels/dm", {
      body: { userId: otherId },
    });
    refreshChannels();
    navigate(`/channels/${channel.id}`);
  }

  const regularChannels = useMemo(() => channels.filter((c) => c.type !== "DM"), [channels]);
  const dmChannels = useMemo(() => channels.filter((c) => c.type === "DM"), [channels]);
  const context: ShellContext = {
    channels, refreshChannels, users, refreshUsers, departments, refreshDepartments, online,
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-1.5 text-sm ${
      isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"
    }`;

  return (
    <div className="flex h-full bg-slate-100">
      <aside className="flex w-64 shrink-0 flex-col bg-slate-900">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-white">TeamCollab</h1>
          <NotificationBell />
        </div>

        <nav className="space-y-0.5 px-2">
          <NavLink to="/tasks" className={navClass}>✓ Tasks</NavLink>
          <NavLink to="/meetings" className={navClass}>📅 Meetings</NavLink>
          <NavLink to="/productivity" className={navClass}>📊 Productivity</NavLink>
          {["MANAGER", "DEPT_HEAD", "ADMIN"].includes(user?.roleLevel ?? "") && (
            <NavLink to="/team" className={navClass}>👥 My team</NavLink>
          )}
          <NavLink to="/search" className={navClass}>🔍 Search</NavLink>
          {user?.roleLevel === "ADMIN" && <NavLink to="/admin" className={navClass}>⚙️ Admin</NavLink>}
        </nav>

        <div className="mt-4 flex-1 overflow-y-auto px-2 pb-4">
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Channels
          </p>
          {regularChannels.map((channel) => (
            <NavLink key={channel.id} to={`/channels/${channel.id}`} className={navClass}>
              <span className="flex items-center justify-between">
                <span className="truncate"># {channel.name}</span>
                {channel.unread > 0 && (
                  <span className="ml-2 rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
                    {channel.unread}
                  </span>
                )}
              </span>
            </NavLink>
          ))}

          <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Direct messages
          </p>
          {dmChannels.map((channel) => (
            <NavLink key={channel.id} to={`/channels/${channel.id}`} className={navClass}>
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-2 truncate">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      channel.dmWith && online.has(channel.dmWith.id) ? "bg-emerald-400" : "bg-slate-600"
                    }`}
                  />
                  {channel.dmWith?.name ?? "Direct message"}
                </span>
                {channel.unread > 0 && (
                  <span className="ml-2 rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
                    {channel.unread}
                  </span>
                )}
              </span>
            </NavLink>
          ))}

          <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            People
          </p>
          {users
            .filter((u) => u.id !== user?.id && u.active)
            .map((u) => (
              <button
                key={u.id}
                onClick={() => openDm(u.id)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    online.has(u.id) ? "bg-emerald-400" : "bg-slate-600"
                  }`}
                />
                <span className="truncate">{u.name}</span>
                <span className="ml-auto truncate text-xs text-slate-500">
                  {u.department?.name ?? ""}
                </span>
              </button>
            ))}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-800 px-4 py-3">
          <Avatar name={user?.name ?? "?"} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">
              {user?.roleLevel.replace("_", " ").toLowerCase()}
              {user?.department ? ` · ${user.department.name}` : ""}
            </p>
          </div>
          <button
            onClick={logout}
            className="text-xs text-slate-400 hover:text-white"
            title="Sign out"
          >
            ⎋
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet context={context} />
      </main>
    </div>
  );
}
