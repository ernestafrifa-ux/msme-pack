import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Check, AlertTriangle, Search } from "lucide-react";
import { Card, PageHeader, ReadOnlyNotice, Btn, Modal, Field, Input, Select, TextArea, iconBtnStyle, Toast } from "../ui-atoms.jsx";
import { fmt, fmtPlain, DISCLOSURE_CATEGORIES } from "../format.js";
import { api } from "../api.js";

export function DisclosuresPage({ disclosures, reload, canEdit }) {
  const [year, setYear] = useState(2025);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const yearDisclosures = useMemo(() => {
    const byYear = disclosures.filter(d => d.year === year);
    if (!search.trim()) return byYear;
    const q = search.toLowerCase();
    return byYear.filter(d => d.label.toLowerCase().includes(q) || (d.note && d.note.toLowerCase().includes(q)));
  }, [disclosures, year, search]);

  const saveDisclosure = async (vals) => {
    setBusy(true);
    const amount = parseFloat(vals.amount) || 0;
    try {
      if (modal.mode === "new") {
        await api.createDisclosure({ year, category: vals.category, label: vals.label, amount, note: vals.note || "" });
      } else {
        await api.updateDisclosure(modal.item.id, { category: vals.category, label: vals.label, amount, note: vals.note || "" });
      }
      setModal(null);
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
      await api.deleteDisclosure(id);
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      setToastMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Toast message={toastMsg} onDismiss={() => setToastMsg("")} />
      <PageHeader title="Disclosures" subtitle="Receivables, payables, investments and trust funds — feeds the Disclosures note in your annual report"
        action={canEdit && <Btn icon={Plus} onClick={() => setModal({ mode: "new" })}>Add disclosure</Btn>} />

      {!canEdit && <ReadOnlyNotice />}

      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
        <Select value={year} onChange={e => { setYear(Number(e.target.value)); setSearch(""); }} style={{ width: 120 }}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </Select>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 11, color: "var(--ink-faint)", pointerEvents: "none" }} />
          <Input placeholder="Search disclosures…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
      </div>

      {DISCLOSURE_CATEGORIES.map(cat => {
        const items = yearDisclosures.filter(d => d.category === cat.id);
        const total = items.reduce((s, d) => s + d.amount, 0);
        return (
          <div key={cat.id} style={{ marginBottom: 18 }}>
            <Card title={cat.label} right={<span className="num" style={{ fontSize: 14 }}>{fmt(total)}</span>}>
              {items.length === 0 ? (
                <div style={{ padding: "16px 18px", fontSize: 13.5, color: "var(--ink-faint)" }}>No {cat.label.toLowerCase()} recorded for {year}.</div>
              ) : (
                <table>
                  <tbody>
                    {items.map(d => (
                      <tr key={d.id} className="amt-row">
                        <td style={{ fontWeight: 600 }}>{d.label}</td>
                        <td style={{ color: "var(--ink-faint)", fontSize: 13 }}>{d.note}</td>
                        <td className="num">{fmtPlain(d.amount)}</td>
                        {canEdit && (
                          <td style={{ whiteSpace: "nowrap", width: 70 }}>
                            <button onClick={() => setModal({ mode: "edit", item: d })} title="Edit" style={iconBtnStyle}><Pencil size={14} /></button>
                            <button onClick={() => setConfirmDelete(d)} title="Delete" style={{ ...iconBtnStyle, color: "var(--expense)" }}><Trash2 size={14} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        );
      })}

      {modal && <DisclosureForm initial={modal.item} mode={modal.mode} onClose={() => setModal(null)} onSave={saveDisclosure} busy={busy} />}

      {confirmDelete && (
        <Modal title="Delete disclosure?" onClose={() => setConfirmDelete(null)} width={400}>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 0 }}>Delete "<strong>{confirmDelete.label}</strong>"? This cannot be undone.</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
            <Btn variant="ghost" onClick={() => setConfirmDelete(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="danger" onClick={() => doDelete(confirmDelete.id)} icon={Trash2} disabled={busy}>{busy ? "Deleting…" : "Delete"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DisclosureForm({ initial, mode, onClose, onSave, busy }) {
  const [category, setCategory] = useState(initial?.category || "receivable");
  const [label, setLabel] = useState(initial?.label || "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [note, setNote] = useState(initial?.note || "");
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!label.trim()) { setError("Description is required."); return; }
    if (!amount || parseFloat(amount) <= 0) { setError("Enter an amount greater than zero."); return; }
    setError("");
    onSave({ category, label: label.trim(), amount, note });
  };

  return (
    <Modal title={mode === "new" ? "Add disclosure" : "Edit disclosure"} onClose={onClose} width={460}>
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
        <Field label="Disclosure category">
          <Select value={category} onChange={e => setCategory(e.target.value)}>
            {DISCLOSURE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Description *"><Input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Heritage Fund" /></Field>
        <Field label="Amount (GH₵) *"><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></Field>
        <Field label="Note" hint="Optional"><TextArea value={note} onChange={e => setNote(e.target.value)} /></Field>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn icon={Check} onClick={handleSave} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
