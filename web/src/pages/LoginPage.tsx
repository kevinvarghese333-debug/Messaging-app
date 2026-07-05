import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../state/AuthContext";

const inputClass =
  "w-full rounded-lg bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-700 focus:ring-indigo-500";
const buttonClass =
  "w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50";

function OtpLogin() {
  const { loginWithToken } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"identifier" | "code">("identifier");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/api/auth/otp/request", { body: { identifier } });
      setStage("code");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ token: string; user: any }>("/api/auth/otp/verify", {
        body: { identifier, code },
      });
      loginWithToken(res.token, res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (stage === "identifier") {
    return (
      <form onSubmit={requestCode} className="space-y-4">
        <input
          className={inputClass}
          placeholder="Phone number or email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button disabled={busy} className={buttonClass}>
          {busy ? "…" : "Send login code"}
        </button>
      </form>
    );
  }
  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm text-slate-400">
        We sent a 6-digit code for <span className="text-slate-200">{identifier}</span>.
      </p>
      <input
        className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
        placeholder="······"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        autoFocus
        required
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button disabled={busy || code.length !== 6} className={buttonClass}>
        {busy ? "…" : "Verify & sign in"}
      </button>
      <button
        type="button"
        onClick={() => {
          setStage("identifier");
          setCode("");
          setError(null);
        }}
        className="w-full text-sm text-indigo-400 hover:text-indigo-300"
      >
        Use a different number
      </button>
      <p className="rounded-lg bg-slate-800/60 p-2.5 text-xs text-slate-500">
        No SMS/email provider configured yet? The code is printed in the server terminal
        (the window running <code>npm run dev</code>).
      </p>
    </form>
  );
}

function PasswordLogin() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, phone, password);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "register" && (
          <>
            <input className={inputClass} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input className={inputClass} placeholder="Mobile number (for OTP login)" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </>
        )}
        <input className={inputClass} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={inputClass} placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button disabled={busy} className={buttonClass}>
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button
        onClick={() => setMode(mode === "login" ? "register" : "login")}
        className="mt-4 text-sm text-indigo-400 hover:text-indigo-300"
      >
        {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </>
  );
}

export default function LoginPage() {
  const [tab, setTab] = useState<"otp" | "password">("otp");

  return (
    <div className="flex h-full items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 p-8 shadow-2xl ring-1 ring-slate-800">
        <h1 className="text-2xl font-bold text-white">TeamCollab</h1>
        <p className="mt-1 text-sm text-slate-400">
          Chat across departments, assign work, never drop a task.
        </p>

        <div className="mt-6 flex rounded-lg bg-slate-800 p-1">
          {(
            [
              ["otp", "Login with OTP"],
              ["password", "Password"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium ${
                tab === value ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5">{tab === "otp" ? <OtpLogin /> : <PasswordLogin />}</div>

        <div className="mt-6 rounded-lg bg-slate-800/60 p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-300">Demo accounts (password: password123)</p>
          <p className="mt-1">
            alice@demo.co (admin) · eva@demo.co (dept head) · mark@demo.co (manager) · dan@demo.co
            (member). OTP works too — phones +91 90000000 01…10 in seed order.
          </p>
        </div>
      </div>
    </div>
  );
}
