import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { MentionTarget } from "../lib/types";

interface Props {
  placeholder?: string;
  onSend: (content: string, file: File | null) => Promise<void>;
  onTyping?: () => void;
  autoFocus?: boolean;
}

export default function Composer({ placeholder, onSend, onTyping, autoFocus }: Props) {
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [targets, setTargets] = useState<MentionTarget[]>([]);
  const [suggestions, setSuggestions] = useState<MentionTarget[]>([]);
  const [selected, setSelected] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ targets: MentionTarget[] }>("/api/mention-targets")
      .then((r) => setTargets(r.targets))
      .catch(() => {});
  }, []);

  function updateSuggestions(text: string, caret: number) {
    const before = text.slice(0, caret);
    const match = before.match(/@([a-zA-Z0-9._-]*)$/);
    if (!match) {
      setSuggestions([]);
      return;
    }
    const query = match[1].toLowerCase();
    setSuggestions(
      targets
        .filter((t) => t.token.includes(query) || t.label.toLowerCase().includes(query))
        .slice(0, 7)
    );
    setSelected(0);
  }

  function insertMention(target: MentionTarget) {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart;
    const before = value.slice(0, caret).replace(/@[a-zA-Z0-9._-]*$/, `@${target.token} `);
    const next = before + value.slice(caret);
    setValue(next);
    setSuggestions([]);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = before.length;
    });
  }

  async function send() {
    const content = value.trim();
    if ((!content && !file) || busy) return;
    setBusy(true);
    try {
      await onSend(content, file);
      setValue("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => (s + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => (s - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(suggestions[selected]);
        return;
      }
      if (e.key === "Escape") {
        setSuggestions([]);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="relative">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 z-40 mb-1 w-80 overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-slate-200">
          {suggestions.map((s, i) => (
            <button
              key={`${s.kind}:${s.token}`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(s);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                i === selected ? "bg-indigo-50" : "hover:bg-slate-50"
              }`}
            >
              <span className="text-xs">
                {s.kind === "user" ? "👤" : s.kind === "department" ? "🏢" : "👥"}
              </span>
              <span className="font-medium text-slate-800">@{s.token}</span>
              <span className="truncate text-xs text-slate-500">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {file && (
        <div className="mb-1 flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
          📎 {file.name}
          <button onClick={() => setFile(null)} className="ml-auto text-slate-400 hover:text-rose-500">
            ✕
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 rounded-xl bg-white p-2 shadow ring-1 ring-slate-200">
        <button
          onClick={() => fileRef.current?.click()}
          className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Attach a file"
        >
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <textarea
          ref={textareaRef}
          rows={1}
          autoFocus={autoFocus}
          className="max-h-40 min-h-[2.25rem] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-slate-800 outline-none"
          placeholder={placeholder ?? "Message… use @ to mention people, departments, or groups"}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            updateSuggestions(e.target.value, e.target.selectionStart);
            onTyping?.();
          }}
          onKeyDown={onKeyDown}
        />
        <button
          onClick={send}
          disabled={busy || (!value.trim() && !file)}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
