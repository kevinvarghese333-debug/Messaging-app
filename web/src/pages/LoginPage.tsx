import { FormEvent, useState } from "react";
import { useAuth } from "../state/AuthContext";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 p-8 shadow-2xl ring-1 ring-slate-800">
        <h1 className="text-2xl font-bold text-white">TeamCollab</h1>
        <p className="mt-1 text-sm text-slate-400">
          Chat across departments, assign work, never drop a task.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {mode === "register" && (
            <input
              className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-700 focus:ring-indigo-500"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-700 focus:ring-indigo-500"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-700 focus:ring-indigo-500"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-4 text-sm text-indigo-400 hover:text-indigo-300"
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>

        <div className="mt-6 rounded-lg bg-slate-800/60 p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-300">Demo accounts (password: password123)</p>
          <p className="mt-1">alice@demo.co (admin) · eva@demo.co (dept head) · mark@demo.co (manager) · dan@demo.co (member)</p>
        </div>
      </div>
    </div>
  );
}
