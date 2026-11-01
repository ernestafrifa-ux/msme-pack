// Reusable visual building blocks shared across every page — ported
// unchanged from the original prototype's design, since the visual design
// itself was already approved; only the data layer around these atoms
// changes when moving from in-memory state to a real backend.
import { useState, useEffect } from "react";
import { X, AlertTriangle, Check, Eye } from "lucide-react";

function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "var(--pill-neutral-bg)", fg: "var(--pill-neutral-fg)" },
    income: { bg: "var(--pill-income-bg)", fg: "var(--pill-income-fg)" },
    expense: { bg: "var(--pill-expense-bg)", fg: "var(--pill-expense-fg)" },
    transfer: { bg: "var(--pill-transfer-bg)", fg: "var(--pill-transfer-fg)" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      background: t.bg, color: t.fg, fontSize: 11.5, fontWeight: 700,
      padding: "3px 9px", borderRadius: 20, letterSpacing: 0.3, textTransform: "uppercase",
      whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4
    }}>{children}</span>
  );
}

function Btn({ children, onClick, variant = "primary", small, icon: Icon, type = "button", disabled, style }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-body)",
    fontWeight: 600, borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid transparent", transition: "all .15s ease",
    fontSize: small ? 13 : 14.5, padding: small ? "6px 12px" : "9px 16px",
    opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    primary: { background: "var(--ink)", color: "var(--paper)" },
    gold: { background: "var(--gold)", color: "var(--ink)" },
    ghost: { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" },
    danger: { background: "transparent", color: "var(--expense)", border: "1px solid var(--expense-line)" },
    subtle: { background: "var(--paper-2)", color: "var(--ink)" },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = "brightness(0.94)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
    >
      {Icon && <Icon size={small ? 14 : 16} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 6, letterSpacing: 0.2 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)", marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid var(--line)",
  fontFamily: "var(--font-body)", fontSize: 14.5, background: "var(--paper)", color: "var(--ink)",
  boxSizing: "border-box", outline: "none",
};

function Input(props) { return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; }
function Select(props) { return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; }
function TextArea(props) { return <textarea {...props} style={{ ...inputStyle, resize: "vertical", minHeight: 64, ...(props.style || {}) }} />; }

function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(27,42,65,0.45)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }} onClick={onClose}>
      <div style={{
        background: "var(--paper)", borderRadius: 14, width, maxWidth: "94vw", maxHeight: "88vh",
        overflow: "auto", boxShadow: "0 24px 60px rgba(27,42,65,0.35)", border: "1px solid var(--line)"
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 22px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0,
          background: "var(--paper)", zIndex: 1
        }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 19, color: "var(--ink)" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-faint)", padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--ink-faint)" }}>
      <Icon size={32} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.6 }} />
      <div style={{ fontWeight: 700, color: "var(--ink-soft)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13.5, maxWidth: 360, margin: "0 auto" }}>{body}</div>
    </div>
  );
}

/* Self-contained alert replacement. Claude.ai's artifact sandbox blocks the
   native window.alert/confirm/prompt dialogs, so validation feedback must be
   rendered in-page. This renders as a fixed banner pinned to the top of the
   viewport, above the modal, so it's visible regardless of scroll position
   and doesn't depend on any blocked browser API. */
function Toast({ message, onDismiss, tone = "error" }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;
  const bg = tone === "success" ? "var(--income)" : "var(--expense)";
  return (
    <div style={{
      position: "fixed", top: 22, left: "50%", transform: "translateX(-50%)", zIndex: 999,
      display: "flex", alignItems: "center", gap: 10, background: bg, color: "#fff",
      borderRadius: 10, padding: "13px 18px", fontSize: 14, fontWeight: 700,
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)", maxWidth: "90vw",
    }}>
      {tone === "success" ? <Check size={17} style={{ flexShrink: 0 }} /> : <AlertTriangle size={17} style={{ flexShrink: 0 }} />}
      <span>{message}</span>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 2, marginLeft: 4, opacity: 0.85, display: "flex" }}>
        <X size={15} />
      </button>
    </div>
  );
}

function StatCard({ label, value, tone, icon: Icon }) {
  const colors = { income: "var(--income)", expense: "var(--expense)", neutral: "var(--ink)" };
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</span>
        <Icon size={16} color={colors[tone]} strokeWidth={2} />
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 19, color: colors[tone] }}>{value}</div>
    </div>
  );
}

function Card({ title, children, right }) {
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
      {title !== "" && (
        <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16.5, fontWeight: 700 }}>{title}</h3>
          {right}
        </div>
      )}
      <div style={{ padding: title ? "4px 0" : 0, overflowX: "auto" }}>{children}</div>
    </div>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
      <div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--ink)" }}>{title}</h1>
        {subtitle && <p style={{ margin: "5px 0 0", color: "var(--ink-faint)", fontSize: 14 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function ReadOnlyNotice() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, background: "var(--paper-3)", border: "1px solid var(--line-strong)",
      borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "var(--ink-soft)", marginBottom: 18
    }}>
      <Eye size={15} /> You're viewing in read-only mode. Only the Treasurer can add or edit records.
    </div>
  );
}

const iconBtnStyle = {
  background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)",
  padding: 6, borderRadius: 6, marginLeft: 2,
};

export { Pill, Btn, Field, Input, Select, TextArea, Modal, EmptyState, Toast, StatCard, Card, PageHeader, ReadOnlyNotice, iconBtnStyle, inputStyle };
