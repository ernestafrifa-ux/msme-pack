import { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, BookOpen, Landmark, FolderTree, Target,
  FileBarChart, Users, ClipboardList, UserCog, ShieldCheck, Eye, LogOut, Pencil,
} from "lucide-react";
import { api, setToken } from "./api.js";
import { ThemeWrapper } from "./theme.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { TransactionsPage } from "./pages/Transactions.jsx";
import { MembersPage } from "./pages/Members.jsx";
import { CategoriesPage } from "./pages/Categories.jsx";
import { AccountsPage } from "./pages/Accounts.jsx";
import { BudgetPage } from "./pages/Budget.jsx";
import { DisclosuresPage } from "./pages/Disclosures.jsx";
import { ReportsPage } from "./pages/Reports.jsx";
import { AdminPage } from "./pages/Admin.jsx";

export function AppShell({ session, onSignOut }) {
  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [members, setMembers] = useState([]);
  const [slips, setSlips] = useState([]);
  const [disclosures, setDisclosures] = useState([]);

  const { user, role } = session;
  const canEdit = !!role.canEdit;
  const canSeeNotes = !!role.canEdit || !!role.canSeeNotes;
  const isAdmin = !!role.canAdmin;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [cats, accs, mems, sl, disc] = await Promise.all([
        api.getCategories(), api.getAccounts(), api.getMembers(), api.getSlips(), api.getDisclosures(),
      ]);
      setCategories(cats);
      setAccounts(accs);
      setMembers(mems);
      setSlips(sl);
      setDisclosures(disc);
    } catch (err) {
      setLoadError(err.message || "Could not load data from the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // If a session expires mid-use (token rejected by the server), drop back
  // to the login screen rather than leaving the app stuck on a failed state.
  useEffect(() => {
    if (loadError && loadError.toLowerCase().includes("session")) {
      setToken(null);
      onSignOut();
    }
  }, [loadError, onSignOut]);

  useEffect(() => {
    if (page === "admin" && !isAdmin) setPage("dashboard");
  }, [page, isAdmin]);

  const incomeCats = useMemo(() => categories.filter(c => c.kind === "income"), [categories]);
  const expenseCats = useMemo(() => categories.filter(c => c.kind === "expense"), [categories]);

  const catLookup = useMemo(() => {
    const map = {};
    categories.forEach(c => map[c.id] = c);
    return map;
  }, [categories]);

  const accountLookup = useMemo(() => {
    const map = {};
    accounts.forEach(a => map[a.id] = a);
    return map;
  }, [accounts]);

  const memberLookup = useMemo(() => {
    const map = {};
    members.forEach(m => map[m.id] = m);
    return map;
  }, [members]);

  // Account balances now come pre-computed from the server (each account
  // row includes a `balance` field), so there's no need to recompute them
  // from the full slip history on every render the way the in-memory
  // prototype had to.
  const accountBalances = useMemo(() => {
    const map = {};
    accounts.forEach(a => map[a.id] = a.balance);
    return map;
  }, [accounts]);

  const cashAccounts = accounts.filter(a => a.kind === "cash");
  const bankAccounts = accounts.filter(a => a.kind === "bank");
  const totalCash = cashAccounts.reduce((s, a) => s + (a.balance ?? a.opening), 0);
  const totalBank = bankAccounts.reduce((s, a) => s + (a.balance ?? a.opening), 0);

  const totals = useMemo(() => {
    let income = 0, expense = 0;
    slips.forEach(s => {
      const slipTotal = s.lines.reduce((sum, l) => sum + (l.amount || 0), 0);
      if (s.kind === "income") income += slipTotal;
      else if (s.kind === "expense") expense += slipTotal;
    });
    return { income, expense, net: income - expense };
  }, [slips]);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "transactions", label: "Transactions", icon: BookOpen },
    { id: "members", label: "Members", icon: Users },
    { id: "categories", label: "Categories", icon: FolderTree },
    { id: "accounts", label: "Bank & Cash", icon: Landmark },
    { id: "budget", label: "Budget vs Actual", icon: Target },
    { id: "disclosures", label: "Disclosures", icon: ClipboardList },
    { id: "reports", label: "Reports", icon: FileBarChart },
    ...(isAdmin ? [{ id: "admin", label: "Admin", icon: UserCog }] : []),
  ];

  return (
    <ThemeWrapper flex>
      <style>{`
        .scrollnav::-webkit-scrollbar { width: 5px; }
      `}</style>

      <Sidebar navItems={navItems} page={page} setPage={setPage} user={user} role={role} onSignOut={onSignOut} />

      <main style={{ flex: 1, minWidth: 0, padding: "30px 36px 60px", maxWidth: 1240 }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--ink-faint)" }}>Loading…</div>
        ) : loadError ? (
          <div style={{ padding: 24, color: "var(--expense)", fontWeight: 600 }}>
            Couldn't load data: {loadError}
            <div style={{ marginTop: 10 }}>
              <button onClick={loadAll} style={{ fontSize: 13, color: "var(--ink)", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}>Try again</button>
            </div>
          </div>
        ) : (
          <>
            {page === "dashboard" && (
              <Dashboard totals={totals} accounts={accounts} accountBalances={accountBalances}
                totalCash={totalCash} totalBank={totalBank} slips={slips} catLookup={catLookup}
                accountLookup={accountLookup} canSeeNotes={canSeeNotes} />
            )}
            {page === "transactions" && (
              <TransactionsPage slips={slips} reload={loadAll}
                incomeCats={incomeCats} expenseCats={expenseCats} accounts={accounts} members={members}
                catLookup={catLookup} accountLookup={accountLookup} memberLookup={memberLookup}
                canEdit={canEdit} canSeeNotes={canSeeNotes} />
            )}
            {page === "members" && (
              <MembersPage members={members} reload={loadAll} slips={slips} catLookup={catLookup} canEdit={canEdit} />
            )}
            {page === "categories" && (
              <CategoriesPage incomeCats={incomeCats} expenseCats={expenseCats} reload={loadAll} canEdit={canEdit} />
            )}
            {page === "accounts" && (
              <AccountsPage accounts={accounts} accountBalances={accountBalances} reload={loadAll} canEdit={canEdit} />
            )}
            {page === "budget" && (
              <BudgetPage incomeCats={incomeCats} expenseCats={expenseCats} slips={slips} canEdit={canEdit} />
            )}
            {page === "disclosures" && (
              <DisclosuresPage disclosures={disclosures} reload={loadAll} canEdit={canEdit} />
            )}
            {page === "reports" && (
              <ReportsPage slips={slips} incomeCats={incomeCats} expenseCats={expenseCats}
                catLookup={catLookup} accounts={accounts} accountBalances={accountBalances}
                totals={totals} canSeeNotes={canSeeNotes} disclosures={disclosures} />
            )}
            {page === "admin" && isAdmin && <AdminPage currentUserId={user.id} />}
          </>
        )}
      </main>
    </ThemeWrapper>
  );
}

function Sidebar({ navItems, page, setPage, user, role, onSignOut }) {
  return (
    <aside style={{
      width: 248, background: "var(--ink)", color: "var(--paper)", flexShrink: 0,
      display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
    }}>
      <div style={{ padding: "26px 22px 18px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, background: "var(--gold)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }}>
            <BookOpen size={18} color="var(--ink)" strokeWidth={2.2} />
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 16.5, fontWeight: 700, lineHeight: 1.15 }}>
            Santasi SDA Church
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--gold-soft)", letterSpacing: 0.4, paddingLeft: 44 }}>
          Church Accounts Ledger
        </div>
      </div>

      <nav className="scrollnav" style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
        {navItems.map(item => {
          const active = page === item.id;
          return (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "10px 12px",
              borderRadius: 8, border: "none", marginBottom: 3, cursor: "pointer", textAlign: "left",
              background: active ? "rgba(184,134,46,0.18)" : "transparent",
              color: active ? "var(--gold)" : "rgba(251,248,242,0.82)",
              fontWeight: active ? 700 : 500, fontSize: 14, fontFamily: "var(--font-body)",
              transition: "background .15s",
            }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
            >
              <item.icon size={17} strokeWidth={2} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ fontSize: 10.5, color: "rgba(251,248,242,0.45)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, paddingLeft: 4, fontWeight: 700 }}>
          Signed in as
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, paddingLeft: 4 }}>{user.name}</div>
        <div style={{ fontSize: 11.5, color: "rgba(251,248,242,0.55)", marginTop: 4, paddingLeft: 4, display: "flex", alignItems: "center", gap: 5 }}>
          {role.canAdmin ? <UserCog size={12} /> : role.canEdit ? <Pencil size={12} /> : role.canSeeNotes ? <ShieldCheck size={12} /> : <Eye size={12} />}
          {role.name}
        </div>
        <button onClick={onSignOut} style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 10, padding: "6px 4px",
          background: "none", border: "none", color: "rgba(251,248,242,0.55)", fontSize: 12.5,
          cursor: "pointer", fontFamily: "var(--font-body)",
        }}>
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  );
}
