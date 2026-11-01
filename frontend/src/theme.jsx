// Provides the church's visual theme (colors, fonts, base element styles) as
// CSS custom properties on a wrapping div. Used by both the logged-out screens
// (login, change password) and the logged-in app shell, so the look is
// consistent everywhere rather than only appearing once someone signs in.
export function ThemeWrapper({ children, flex }) {
  return (
    <div style={{
      "--ink": "#1B2A41", "--ink-soft": "#3D5066", "--ink-faint": "#8C9AAB",
      "--paper": "#FBF8F2", "--paper-2": "#F1ECE1", "--paper-3": "#EDE6D6",
      "--gold": "#B8862E", "--gold-soft": "#E8D4A8",
      "--line": "#E2DBC9", "--line-strong": "#C9BFA3",
      "--income": "#2F5233", "--income-line": "#bcd3bd",
      "--expense": "#8B2E2E", "--expense-line": "#e0bcbc",
      "--pill-neutral-bg": "#EDE6D6", "--pill-neutral-fg": "#3D5066",
      "--pill-income-bg": "#E3ECE3", "--pill-income-fg": "#2F5233",
      "--pill-expense-bg": "#F3E2E2", "--pill-expense-fg": "#8B2E2E",
      "--pill-transfer-bg": "#E5E9F0", "--pill-transfer-fg": "#3D5066",
      "--font-display": "'Source Serif 4', Georgia, serif",
      "--font-body": "'IBM Plex Sans', -apple-system, sans-serif",
      "--font-mono": "'IBM Plex Mono', monospace",
      minHeight: "100vh", background: "var(--paper-2)", color: "var(--ink)",
      fontFamily: "var(--font-body)", display: flex ? "flex" : undefined,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        ::selection { background: var(--gold-soft); }
        table { border-collapse: collapse; width: 100%; }
        th { text-align: left; font-size: 11.5px; letter-spacing: 0.4px; text-transform: uppercase; color: var(--ink-faint); font-weight: 700; padding: 10px 14px; border-bottom: 2px solid var(--line-strong); }
        td { padding: 11px 14px; border-bottom: 1px solid var(--line); font-size: 14px; }
        tr.amt-row:hover { background: var(--paper-3); }
        .num { font-family: var(--font-mono); font-weight: 600; text-align: right; white-space: nowrap; }
        .scrollnav::-webkit-scrollbar { width: 5px; }
        .scrollnav::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 4px; }
        select { -webkit-appearance: none; appearance: none; }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--gold); outline-offset: 1px; }
      `}</style>
      {children}
    </div>
  );
}
