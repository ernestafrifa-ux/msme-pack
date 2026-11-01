import { useState, useMemo, useEffect } from "react";
import {
  Plus, Pencil, Trash2, Search, Check, AlertTriangle, ArrowRight, StickyNote, Receipt,
} from "lucide-react";
import {
  Card, PageHeader, EmptyState, ReadOnlyNotice, Pill, Btn, Modal, Field, Input, Select, TextArea, Toast, iconBtnStyle,
} from "../ui-atoms.jsx";
import { fmt, fmtPlain, todayStr, TRANSFER_TYPES } from "../format.js";
import { api } from "../api.js";

let tempLineCounter = 0;
const tempLineId = () => `tmpline-${++tempLineCounter}`;

export function TransactionsPage({ slips, reload, incomeCats, expenseCats, accounts, members, catLookup, accountLookup, memberLookup, canEdit, canSeeNotes }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const filtered = useMemo(() => {
    return slips
      .filter(s => filterType === "all" || s.kind === filterType)
      .filter(s => {
        if (!search.trim()) return true;
        const lineText = s.lines.map(l => `${catLookup[l.catId]?.name || ""} ${l.subName || ""}`).join(" ");
        const hay = `${lineText} ${s.note || ""} ${accountLookup[s.accountId]?.name || ""} ${accountLookup[s.toAccountId]?.name || ""} ${s.chequeNo || ""} ${s.pvNo || ""}`.toLowerCase();
        return hay.includes(search.toLowerCase());
      })
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  }, [slips, filterType, search, catLookup, accountLookup]);

  // Reset to page 1 when filter/search changes
  useMemo(() => { setPage(1); }, [filterType, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (s) => { setEditing(s); setShowForm(true); };

  const saveSlip = async (slip) => {
    setBusy(true);
    try {
      if (editing) await api.updateSlip(editing.id, slip);
      else await api.createSlip(slip);
      setShowForm(false);
      await reload();
    } catch (err) {
      setToastMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (id) => {
    setBusy(true);
    try {
      await api.deleteSlip(id);
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      setToastMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const slipTotal = (s) => s.kind === "transfer" ? s.amount : s.lines.reduce((sum, l) => sum + (l.amount || 0), 0);

  return (
    <div>
      <Toast message={toastMsg} onDismiss={() => setToastMsg("")} />
      <PageHeader title="Transactions" subtitle="Income, expenditure and account transfers — each entry can carry multiple category lines"
        action={canEdit && <Btn icon={Plus} onClick={openNew}>Record transaction</Btn>} />

      {!canEdit && <ReadOnlyNotice />}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 11, color: "var(--ink-faint)" }} />
          <Input placeholder="Search category, note, cheque no…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "income", "expense", "transfer"].map(f => (
            <button key={f} onClick={() => setFilterType(f)} style={{
              padding: "7px 14px", borderRadius: 20, border: "1px solid " + (filterType === f ? "var(--ink)" : "var(--line)"),
              background: filterType === f ? "var(--ink)" : "var(--paper)", color: filterType === f ? "var(--paper)" : "var(--ink-soft)",
              fontSize: 13, fontWeight: 600, cursor: "pointer", textTransform: "capitalize"
            }}>{f}</button>
          ))}
        </div>
      </div>

      <Card title="">
        {filtered.length === 0 ? (
          <EmptyState icon={Receipt} title="No transactions found" body="Try a different filter or search term, or record a new transaction." />
        ) : (
          <>
          <table style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th style={{ width: 92 }}>Date</th>
                <th style={{ width: 78 }}>Type</th>
                <th>Details</th>
                <th style={{ textAlign: "right", width: 110 }}>Amount</th>
                {canEdit && <th style={{ width: 64 }}></th>}
              </tr>
            </thead>
            <tbody>
              {paginated.map(s => {
                const fromAcc = accountLookup[s.accountId];
                const toAcc = accountLookup[s.toAccountId];
                const total = slipTotal(s);
                return (
                  <tr key={s.id} className="amt-row">
                    <td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>{s.date}</td>
                    <td style={{ verticalAlign: "top" }}><Pill tone={s.kind}>{s.kind}</Pill></td>
                    <td>
                      <div style={{ marginBottom: 3 }}>
                        {s.kind === "transfer" ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                            {fromAcc?.name} <ArrowRight size={12} /> {toAcc?.name}
                          </span>
                        ) : s.lines.length === 1 ? (
                          <span style={{ fontWeight: 600 }}>{catLookup[s.lines[0].catId]?.name}{s.lines[0].subName && <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}> · {s.lines[0].subName}</span>}</span>
                        ) : (
                          <details>
                            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{s.lines.length} categories</summary>
                            <div style={{ marginTop: 6 }}>
                              {s.lines.map(l => (
                                <div key={l.id} style={{ fontSize: 12.5, color: "var(--ink-soft)", padding: "2px 0", fontWeight: 400 }}>
                                  {catLookup[l.catId]?.name}{l.subName ? " · " + l.subName : ""} — {fmtPlain(l.amount)}
                                  {l.memberId && memberLookup[l.memberId] && <span style={{ color: "var(--ink-faint)" }}> ({memberLookup[l.memberId].name})</span>}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>
                        {s.kind === "transfer" ? "Transfer" :
                          s.method === "cash" ? "Cash" : s.method === "cheque" ? `Cheque · ${fromAcc?.name || "—"}` : fromAcc?.name || "—"}
                        {s.chequeNo && ` · Chq ${s.chequeNo}`}
                        {s.pvNo && ` · ${s.pvNo}`}
                      </div>
                      {canSeeNotes && s.note && (
                        <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 3, display: "flex", alignItems: "flex-start", gap: 5 }}>
                          <StickyNote size={11} style={{ marginTop: 2, flexShrink: 0 }} />{s.note}
                        </div>
                      )}
                    </td>
                    <td className="num" style={{ verticalAlign: "top", color: s.kind === "income" ? "var(--income)" : s.kind === "expense" ? "var(--expense)" : "var(--ink-soft)" }}>
                      {s.kind === "expense" ? "-" : ""}{fmtPlain(total)}
                    </td>
                    {canEdit && (
                      <td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                        <button onClick={() => openEdit(s)} title="Edit" style={iconBtnStyle}><Pencil size={14} /></button>
                        <button onClick={() => setConfirmDelete(s)} title="Delete" style={{ ...iconBtnStyle, color: "var(--expense)" }}><Trash2 size={14} /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </Card>

      {showForm && (
        <SlipForm
          initial={editing}
          incomeCats={incomeCats} expenseCats={expenseCats} accounts={accounts} members={members}
          onClose={() => setShowForm(false)} onSave={saveSlip} busy={busy}
        />
      )}

      {confirmDelete && (
        <Modal title="Delete transaction?" onClose={() => setConfirmDelete(null)} width={400}>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 0 }}>
            This will permanently remove this {confirmDelete.kind} record of {fmt(slipTotal(confirmDelete))} dated {confirmDelete.date}. This cannot be undone.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
            <Btn variant="ghost" onClick={() => setConfirmDelete(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="danger" onClick={() => doDelete(confirmDelete.id)} icon={Trash2} disabled={busy}>{busy ? "Deleting…" : "Delete"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- Multi-line slip form ---------------- */

function SlipForm({ initial, incomeCats, expenseCats, accounts, members, onClose, onSave, busy }) {
  const [kind, setKind] = useState(initial?.kind || "income");
  const [date, setDate] = useState(initial?.date || todayStr());
  const [method, setMethod] = useState(initial?.method || "cash");
  const [accountId, setAccountId] = useState(initial?.accountId || "");
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId || "");
  const [transferType, setTransferType] = useState(initial?.method && TRANSFER_TYPES.find(t => t.id === initial.method) ? initial.method : "cash-to-bank");
  const [transferAmount, setTransferAmount] = useState(initial?.amount ?? "");
  const [chequeNo, setChequeNo] = useState(initial?.chequeNo || "");
  const [payerBank, setPayerBank] = useState(initial?.payerBank || "");
  const [pvNo, setPvNo] = useState(initial?.pvNo || "");
  const [note, setNote] = useState(initial?.note || "");
  const [lines, setLines] = useState(initial?.lines?.length ? initial.lines : [{ id: tempLineId(), catId: "", subName: "", memberId: "", amount: "" }]);
  const [error, setError] = useState("");

  const catList = kind === "income" ? incomeCats : expenseCats;
  const cashAccounts = accounts.filter(a => a.kind === "cash");
  const bankAccounts = accounts.filter(a => a.kind === "bank");

  // Auto-select the account whenever the relevant pool has exactly one option,
  // so a single cash box or single bank account doesn't require an extra click.
  const relevantPool = kind === "transfer" ? [] : (method === "cash" ? cashAccounts : bankAccounts);
  useEffect(() => {
    if (kind !== "transfer" && !accountId && relevantPool.length === 1) {
      setAccountId(relevantPool[0].id);
    }
  }, [kind, method, accountId, relevantPool]);

  const updateLine = (id, patch) => setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  const addLine = () => setLines(prev => [...prev, { id: tempLineId(), catId: "", subName: "", memberId: "", amount: "" }]);
  const removeLine = (id) => setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);

  const lineTotal = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  const handleSave = () => {
    const fail = (msg) => { setError(msg); };
    if (kind === "transfer") {
      const amt = parseFloat(transferAmount);
      if (!amt || amt <= 0) { fail("Enter a transfer amount greater than zero."); return; }
      if (!accountId || !toAccountId) { fail("Select both the source and destination accounts."); return; }
      if (accountId === toAccountId) { fail("Source and destination accounts must be different."); return; }
      onSave({ kind: "transfer", date, method: transferType, accountId, toAccountId, amount: amt, lines: [], note, chequeNo: "", pvNo: "", payerBank: "" });
      return;
    }

    if (!accountId) { fail(`Select a${method === "cash" ? " cash account" : " bank account"} before saving.`); return; }
    for (const l of lines) {
      if (!l.catId) { fail("Every line needs a category selected."); return; }
      if (!l.amount || parseFloat(l.amount) <= 0) { fail("Every line needs an amount greater than zero."); return; }
    }
    setError("");
    onSave({
      kind, date, method, accountId, toAccountId: null,
      chequeNo: (kind === "income" && method === "cheque") || (kind === "expense" && method === "bank") ? chequeNo : "",
      payerBank: kind === "income" && method === "cheque" ? payerBank : "",
      pvNo: kind === "expense" && method === "bank" ? pvNo : "",
      lines: lines.map(l => ({ catId: l.catId, subName: l.subName, memberId: l.memberId || null, amount: parseFloat(l.amount) })),
      note,
    });
  };

  return (
    <Modal title={initial ? "Edit transaction" : "Record transaction"} onClose={onClose} width={640}>
      <Toast message={error} onDismiss={() => setError("")} />
      <div>
        {error && (
          <div style={{
            display: "flex", gap: 9, alignItems: "flex-start", background: "var(--pill-expense-bg)",
            color: "var(--expense)", border: "1px solid var(--expense-line)", borderRadius: 9,
            padding: "11px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 16
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}

        <Field label="Transaction type">
          <div style={{ display: "flex", gap: 8 }}>
            {[{ k: "income", l: "Income" }, { k: "expense", l: "Expenditure" }, { k: "transfer", l: "Transfer" }].map(opt => (
              <button key={opt.k} type="button" onClick={() => { setKind(opt.k); setAccountId(""); setToAccountId(""); }} style={{
                flex: 1, padding: "9px 6px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: "1px solid " + (kind === opt.k ? "var(--ink)" : "var(--line)"),
                background: kind === opt.k ? "var(--ink)" : "var(--paper)",
                color: kind === opt.k ? "var(--paper)" : "var(--ink-soft)",
              }}>{opt.l}</button>
            ))}
          </div>
        </Field>

        <Field label="Date">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} required style={{ maxWidth: 200 }} />
        </Field>

        {kind === "transfer" ? (
          <>
            <Field label="Transfer type">
              <Select value={transferType} onChange={e => { setTransferType(e.target.value); setAccountId(""); setToAccountId(""); }}>
                {TRANSFER_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            </Field>
            {(() => {
              const tt = TRANSFER_TYPES.find(t => t.id === transferType);
              const fromPool = tt.from === "cash" ? cashAccounts : bankAccounts;
              const toPool = tt.to === "cash" ? cashAccounts : bankAccounts;
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "end", marginBottom: 14 }}>
                  <Field label={`From (${tt.from})`}>
                    <Select value={accountId} onChange={e => setAccountId(e.target.value)} required>
                      <option value="">Select…</option>
                      {fromPool.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  </Field>
                  <div style={{ paddingBottom: 10 }}><ArrowRight size={18} color="var(--ink-faint)" /></div>
                  <Field label={`To (${tt.to})`}>
                    <Select value={toAccountId} onChange={e => setToAccountId(e.target.value)} required>
                      <option value="">Select…</option>
                      {toPool.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  </Field>
                </div>
              );
            })()}
            <Field label="Amount (GH₵)">
              <Input type="number" step="0.01" min="0.01" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="0.00" required />
            </Field>
          </>
        ) : (
          <>
            {kind === "income" && (
              <Field label="Received by">
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ k: "cash", l: "Cash" }, { k: "cheque", l: "Cheque" }].map(opt => (
                    <button key={opt.k} type="button" onClick={() => { setMethod(opt.k); setAccountId(""); }} style={{
                      flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: "1px solid " + (method === opt.k ? "var(--ink)" : "var(--line)"),
                      background: method === opt.k ? "var(--ink)" : "var(--paper)",
                      color: method === opt.k ? "var(--paper)" : "var(--ink-soft)",
                    }}>{opt.l}</button>
                  ))}
                </div>
              </Field>
            )}
            {kind === "expense" && (
              <Field label="Paid from">
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ k: "cash", l: "Cash" }, { k: "bank", l: "Bank" }].map(opt => (
                    <button key={opt.k} type="button" onClick={() => { setMethod(opt.k); setAccountId(""); }} style={{
                      flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: "1px solid " + (method === opt.k ? "var(--ink)" : "var(--line)"),
                      background: method === opt.k ? "var(--ink)" : "var(--paper)",
                      color: method === opt.k ? "var(--paper)" : "var(--ink-soft)",
                    }}>{opt.l}</button>
                  ))}
                </div>
              </Field>
            )}

            <Field label={method === "cash" ? "Cash account" : "Bank account"}>
              <Select value={accountId} onChange={e => setAccountId(e.target.value)} required>
                <option value="">Select account…</option>
                {(method === "cash" ? cashAccounts : bankAccounts).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>

            {kind === "income" && method === "cheque" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Cheque number"><Input value={chequeNo} onChange={e => setChequeNo(e.target.value)} placeholder="e.g. CHQ-00231" /></Field>
                <Field label="Drawer's bank" hint="Optional"><Input value={payerBank} onChange={e => setPayerBank(e.target.value)} placeholder="e.g. Ecobank Kumasi" /></Field>
              </div>
            )}
            {kind === "expense" && method === "bank" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Cheque number"><Input value={chequeNo} onChange={e => setChequeNo(e.target.value)} placeholder="e.g. CHQ-04471" /></Field>
                <Field label="PV number" hint="Payment voucher reference"><Input value={pvNo} onChange={e => setPvNo(e.target.value)} placeholder="e.g. PV-2026-018" /></Field>
              </div>
            )}

            <div style={{ marginTop: 6, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", letterSpacing: 0.2 }}>Category lines</span>
              <Btn small variant="subtle" icon={Plus} onClick={addLine}>Add line</Btn>
            </div>

            {lines.map((line) => {
              const cat = catList.find(c => c.id === line.catId);
              return (
                <div key={line.id} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: 12, marginBottom: 10, background: "var(--paper-2)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.9fr auto", gap: 8, alignItems: "start" }}>
                    <Select value={line.catId} onChange={e => updateLine(line.id, { catId: e.target.value, subName: "" })} required>
                      <option value="">Category…</option>
                      {catList.map(c => <option key={c.id} value={c.id}>{c.noteNo ? `${c.noteNo}. ` : ""}{c.name}</option>)}
                    </Select>
                    <Select value={line.subName} onChange={e => updateLine(line.id, { subName: e.target.value })} disabled={!cat || cat.subs.length === 0}>
                      <option value="">{cat?.subs.length ? "Subcategory…" : "No subcategory"}</option>
                      {cat?.subs.map(s => <option key={s} value={s}>{s}</option>)}
                    </Select>
                    <Input type="number" step="0.01" min="0.01" placeholder="Amount" value={line.amount} onChange={e => updateLine(line.id, { amount: e.target.value })} required />
                    <button type="button" onClick={() => removeLine(line.id)} disabled={lines.length === 1} style={{ ...iconBtnStyle, color: "var(--expense)", opacity: lines.length === 1 ? 0.35 : 1, marginTop: 8 }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {kind === "income" && (
                    <div style={{ marginTop: 8 }}>
                      <Select value={line.memberId || ""} onChange={e => updateLine(line.id, { memberId: e.target.value })} style={{ fontSize: 13 }}>
                        <option value="">Link to member (optional)…</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.name} · {m.envelopeNo}</option>)}
                      </Select>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "8px 4px", fontSize: 14, fontWeight: 700 }}>
              Slip total: <span className="num" style={{ fontFamily: "var(--font-mono)" }}>{fmtPlain(lineTotal)}</span>
            </div>
          </>
        )}

        <Field label="Note to accounts" hint="Explain the entry — visible to the Treasurer and Auditor for audit purposes.">
          <TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Sabbath collection for 21 June, counted by Deacons Mensah & Owusu" />
        </Field>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn icon={Check} onClick={handleSave} disabled={busy}>{busy ? "Saving…" : (initial ? "Save changes" : "Record transaction")}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function Pagination({ page, totalPages, total, pageSize, onPage }) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px", borderTop: "1px solid var(--line)", fontSize: 13,
      color: "var(--ink-soft)"
    }}>
      <span>Showing {start}–{end} of {total}</span>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={() => onPage(1)} disabled={page === 1} style={pgBtn(page === 1)}>«</button>
        <button onClick={() => onPage(page - 1)} disabled={page === 1} style={pgBtn(page === 1)}>‹</button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
          return (
            <button key={p} onClick={() => onPage(p)} style={pgBtn(false, p === page)}>{p}</button>
          );
        })}
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages} style={pgBtn(page === totalPages)}>›</button>
        <button onClick={() => onPage(totalPages)} disabled={page === totalPages} style={pgBtn(page === totalPages)}>»</button>
      </div>
    </div>
  );
}

function pgBtn(disabled, active = false) {
  return {
    minWidth: 32, height: 32, borderRadius: 6, border: "1px solid " + (active ? "var(--ink)" : "var(--line)"),
    background: active ? "var(--ink)" : "var(--paper)", color: active ? "var(--paper)" : disabled ? "var(--ink-faint)" : "var(--ink-soft)",
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: active ? 700 : 400,
    opacity: disabled ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center",
  };
}
