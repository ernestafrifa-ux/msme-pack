import { useState } from "react";
import { Lock, BookOpen, Check, AlertTriangle } from "lucide-react";
import { Btn, Field, Input, Toast } from "./ui-atoms.jsx";
import { api, setToken } from "./api.js";

export function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!username.trim() || !password) { setError("Enter your username and password."); return; }
    setLoading(true);
    setError("");
    try {
      const result = await api.login(username.trim(), password);
      setToken(result.token);
      onLoggedIn(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--paper-2)", fontFamily: "var(--font-body)",
    }}>
      <Toast message={error} onDismiss={() => setError("")} />
      <div style={{ width: 380, background: "var(--paper)", borderRadius: 16, border: "1px solid var(--line)", padding: 32, boxShadow: "0 24px 60px rgba(27,42,65,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <BookOpen size={20} color="var(--ink)" strokeWidth={2.2} />
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, color: "var(--ink)" }}>Santasi SDA Church</div>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginBottom: 26, paddingLeft: 48 }}>Church Accounts Ledger</div>

        {error && (
          <div style={{
            display: "flex", gap: 9, alignItems: "flex-start", background: "var(--pill-expense-bg)",
            color: "var(--expense)", border: "1px solid var(--expense-line)", borderRadius: 9,
            padding: "11px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 16
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}

        <Field label="Username">
          <Input autoFocus value={username} onChange={e => setUsername(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} placeholder="e.g. treasurer.you" />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} placeholder="••••••••" />
        </Field>

        <Btn icon={Lock} onClick={handleSubmit} disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>
          {loading ? "Signing in…" : "Sign in"}
        </Btn>

        <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 18, textAlign: "center", lineHeight: 1.5 }}>
          Forgotten your password? Ask the Treasurer to reset it for you from the Admin page.
        </div>
      </div>
    </div>
  );
}

export function ChangePasswordGate({ onChanged }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!current) { setError("Enter your current (temporary) password."); return; }
    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("New password and confirmation don't match."); return; }
    setLoading(true);
    setError("");
    try {
      await api.changePassword(current, next);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--paper-2)", fontFamily: "var(--font-body)",
    }}>
      <Toast message={error} onDismiss={() => setError("")} />
      <div style={{ width: 400, background: "var(--paper)", borderRadius: 16, border: "1px solid var(--line)", padding: 32, boxShadow: "0 24px 60px rgba(27,42,65,0.18)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>Set a new password</div>
        <div style={{ fontSize: 13, color: "var(--ink-faint)", marginBottom: 22, lineHeight: 1.5 }}>
          You're signed in with a temporary password. Choose a new one only you know before continuing.
        </div>

        {error && (
          <div style={{
            display: "flex", gap: 9, alignItems: "flex-start", background: "var(--pill-expense-bg)",
            color: "var(--expense)", border: "1px solid var(--expense-line)", borderRadius: 9,
            padding: "11px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 16
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}

        <Field label="Current (temporary) password">
          <Input type="password" autoFocus value={current} onChange={e => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <Input type="password" value={next} onChange={e => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} />
        </Field>

        <Btn icon={Check} onClick={handleSubmit} disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>
          {loading ? "Saving…" : "Set new password"}
        </Btn>
      </div>
    </div>
  );
}
