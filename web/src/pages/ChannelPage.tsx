import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { Message } from "../lib/types";
import { useAuth } from "../state/AuthContext";
import { useShell } from "./Shell";
import Avatar from "../components/Avatar";
import Composer from "../components/Composer";
import TaskModal from "../components/TaskModal";
import { statusLabel } from "../lib/status";

interface ChannelDetail {
  id: string;
  name: string;
  type: "PUBLIC" | "PRIVATE" | "DM";
  department?: { id: string; name: string } | null;
  members: { userId: string; user: { id: string; name: string; handle: string } }[];
  isMember: boolean;
}

function renderContent(content: string) {
  const parts = content.split(/(@[a-zA-Z0-9._-]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="rounded bg-indigo-100 px-1 font-medium text-indigo-700">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function MessageRow({
  message,
  isReply,
  onOpenThread,
  onAssign,
}: {
  message: Message;
  isReply?: boolean;
  onOpenThread?: (m: Message) => void;
  onAssign?: (m: Message) => void;
}) {
  const isImage = message.attachmentType?.startsWith("image/");
  return (
    <div className="group flex gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
      <Avatar name={message.author.name} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold text-slate-800">{message.author.name}</span>{" "}
          <span className="text-xs text-slate-400">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </p>
        {message.content && (
          <p className="whitespace-pre-wrap break-words text-sm text-slate-700">
            {renderContent(message.content)}
          </p>
        )}
        {message.attachmentPath &&
          (isImage ? (
            <img
              src={message.attachmentPath}
              alt={message.attachmentName ?? "attachment"}
              className="mt-1 max-h-64 max-w-sm rounded-lg ring-1 ring-slate-200"
            />
          ) : (
            <a
              href={message.attachmentPath}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              📎 {message.attachmentName}
            </a>
          ))}
        {message.task && (
          <Link
            to={`/tasks?taskId=${message.task.id}`}
            className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200"
          >
            ✓ Task: {message.task.title.slice(0, 40)} · {statusLabel(message.task.status)}
          </Link>
        )}
        {!isReply && message._count.replies > 0 && onOpenThread && (
          <button
            onClick={() => onOpenThread(message)}
            className="mt-1 block text-xs font-medium text-indigo-600 hover:underline"
          >
            💬 {message._count.replies} {message._count.replies === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>
      {!isReply && (
        <div className="hidden shrink-0 items-start gap-1 group-hover:flex">
          {onOpenThread && (
            <button
              onClick={() => onOpenThread(message)}
              className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 shadow ring-1 ring-slate-200 hover:text-indigo-600"
              title="Reply in thread"
            >
              💬
            </button>
          )}
          {onAssign && !message.task && (
            <button
              onClick={() => onAssign(message)}
              className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 shadow ring-1 ring-slate-200 hover:text-emerald-600"
              title="Assign as task"
            >
              ✓ Assign
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { users, departments, refreshChannels } = useShell();
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [thread, setThread] = useState<{ parent: Message; replies: Message[] } | null>(null);
  const [assigning, setAssigning] = useState<Message | null>(null);
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingSent = useRef(0);

  const markRead = useCallback(() => {
    if (channelId) {
      api(`/api/channels/${channelId}/read`, { body: {} }).then(refreshChannels).catch(() => {});
    }
  }, [channelId, refreshChannels]);

  useEffect(() => {
    if (!channelId) return;
    setThread(null);
    setMessages([]);
    setNotice(null);
    Promise.all([
      api<{ channel: ChannelDetail }>(`/api/channels/${channelId}`),
      api<{ messages: Message[] }>(`/api/channels/${channelId}/messages`),
    ])
      .then(([c, m]) => {
        setChannel(c.channel);
        setMessages(m.messages);
        markRead();
      })
      .catch((err) => setNotice(err.message));

    const socket = getSocket();
    socket?.emit("channel:join", channelId);

    const threadParam = searchParams.get("thread");
    if (threadParam) {
      api<{ parent: Message; replies: Message[] }>(`/api/messages/${threadParam}/thread`)
        .then(setThread)
        .catch(() => {});
    }
    return () => {
      socket?.emit("channel:leave", channelId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !channelId) return;
    const onMessage = ({ message }: { message: Message }) => {
      if (message.channelId !== channelId) return;
      if (message.parentId) {
        setThread((t) =>
          t && t.parent.id === message.parentId ? { ...t, replies: [...t.replies, message] } : t
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.parentId ? { ...m, _count: { replies: m._count.replies + 1 } } : m
          )
        );
      } else {
        setMessages((prev) => [...prev, message]);
      }
      markRead();
    };
    const onTyping = ({ channelId: cid, userId, name }: { channelId: string; userId: string; name: string }) => {
      if (cid !== channelId || userId === user?.id) return;
      setTyping((prev) => ({ ...prev, [userId]: name }));
      clearTimeout(typingTimers.current[userId]);
      typingTimers.current[userId] = setTimeout(() => {
        setTyping((prev) => {
          const { [userId]: _, ...rest } = prev;
          return rest;
        });
      }, 3000);
    };
    const onTaskUpdated = () => {
      // Refresh task chips on messages when tasks change.
      api<{ messages: Message[] }>(`/api/channels/${channelId}/messages`)
        .then((r) => setMessages(r.messages))
        .catch(() => {});
    };
    socket.on("message:new", onMessage);
    socket.on("typing", onTyping);
    socket.on("task:updated", onTaskUpdated);
    return () => {
      socket.off("message:new", onMessage);
      socket.off("typing", onTyping);
      socket.off("task:updated", onTaskUpdated);
    };
  }, [channelId, user?.id, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(content: string, file: File | null, parentId?: string) {
    if (!channelId) return;
    if (file) {
      const fd = new FormData();
      fd.append("content", content);
      if (parentId) fd.append("parentId", parentId);
      fd.append("file", file);
      await api(`/api/channels/${channelId}/messages`, { formData: fd });
    } else {
      await api(`/api/channels/${channelId}/messages`, { body: { content, parentId } });
    }
  }

  function emitTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current > 1500) {
      lastTypingSent.current = now;
      getSocket()?.emit("typing", channelId);
    }
  }

  async function openThread(message: Message) {
    const t = await api<{ parent: Message; replies: Message[] }>(`/api/messages/${message.id}/thread`);
    setThread(t);
  }

  const title =
    channel?.type === "DM"
      ? channel.members.find((m) => m.userId !== user?.id)?.user.name ?? "Direct message"
      : `# ${channel?.name ?? ""}`;
  const typingNames = Object.values(typing);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          {channel?.department && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {channel.department.name} department
            </span>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {channel ? `${channel.members.length} members` : ""}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {notice && <p className="px-3 text-sm text-rose-500">{notice}</p>}
          {messages.map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              onOpenThread={openThread}
              onAssign={setAssigning}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 pb-1 text-xs text-slate-400">
          {typingNames.length > 0 && `${typingNames.join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing…`}
          &nbsp;
        </div>
        <div className="px-4 pb-4">
          <Composer onSend={(c, f) => send(c, f)} onTyping={emitTyping} autoFocus />
        </div>
      </div>

      {thread && (
        <aside className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800">Thread</h3>
            <button onClick={() => setThread(null)} className="text-slate-400 hover:text-slate-700">
              ✕
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-2">
            <MessageRow message={thread.parent} isReply />
            <div className="my-2 border-t border-slate-100" />
            {thread.replies.map((m) => (
              <MessageRow key={m.id} message={m} isReply />
            ))}
          </div>
          <div className="p-3">
            <Composer
              placeholder="Reply in thread…"
              onSend={(c, f) => send(c, f, thread.parent.id)}
            />
          </div>
        </aside>
      )}

      {assigning && (
        <TaskModal
          users={users}
          departments={departments}
          source={{ id: assigning.id, content: assigning.content }}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            if (channelId) {
              api<{ messages: Message[] }>(`/api/channels/${channelId}/messages`)
                .then((r) => setMessages(r.messages))
                .catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
}
