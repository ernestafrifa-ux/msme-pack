import { useState } from "react";
import { Plus, Pencil, Trash2, Check, AlertTriangle } from "lucide-react";
import { Modal, Btn, Field, Input, Toast, iconBtnStyle } from "./ui-atoms.jsx";

// Edits a category's name, note number, and its full list of subcategories
// together in one place, all staged locally until "Save changes" commits
// them in one PUT request to the backend.
export function CategoryEditor({ cat, onClose, onUpdate, busy }) {
  const [name, setName] = useState(cat.name);
  const [noteNo, setNoteNo] = useState(cat.noteNo ?? "");
  const [subs, setSubs] = useState(cat.subs || []);
  const [newSub, setNewSub] = useState("");
  const [editingSubIdx, setEditingSubIdx] = useState(null);
  const [editingSubVal, setEditingSubVal] = useState("");
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!name.trim()) { setError("Category name is required."); return; }
    setError("");
    onUpdate({ name: name.trim(), noteNo: noteNo ? parseInt(noteNo, 10) : null, subs });
  };

  const addSub = () => {
    const v = newSub.trim();
    if (!v) return;
    if (subs.includes(v)) { setError("That subcategory already exists."); return; }
    setSubs(prev => [...prev, v]);
    setNewSub("");
    setError("");
  };

  const startEditSub = (i) => { setEditingSubIdx(i); setEditingSubVal(subs[i]); };
  const commitEditSub = () => {
    const v = editingSubVal.trim();
    if (!v) { setEditingSubIdx(null); return; }
    setSubs(prev => prev.map((s, i) => i === editingSubIdx ? v : s));
    setEditingSubIdx(null);
  };
  const removeSub = (i) => {
    setSubs(prev => prev.filter((_, idx) => idx !== i));
  };

  return (
    <Modal title="Edit category" onClose={onClose} width={500}>
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 14 }}>
          <Field label="Category name *">
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="Note number">
            <Input type="number" value={noteNo} onChange={e => setNoteNo(e.target.value)} placeholder="None" />
          </Field>
        </div>

        <div style={{ marginTop: 8, marginBottom: 10 }}>
          <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8, letterSpacing: 0.2 }}>
            Subcategories {subs.length > 0 && `(${subs.length})`}
          </span>

          {subs.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-faint)", padding: "10px 0" }}>No subcategories yet — add one below.</div>
          ) : (
            <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
              {subs.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                  borderBottom: i < subs.length - 1 ? "1px solid var(--line)" : "none", background: "var(--paper)"
                }}>
                  {editingSubIdx === i ? (
                    <>
                      <Input autoFocus value={editingSubVal} onChange={e => setEditingSubVal(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && commitEditSub()}
                        style={{ flex: 1, padding: "5px 9px", fontSize: 13.5 }} />
                      <button onClick={commitEditSub} title="Confirm" style={iconBtnStyle}><Check size={14} /></button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 13.5 }}>{s}</span>
                      <button onClick={() => startEditSub(i)} title="Edit" style={iconBtnStyle}><Pencil size={13} /></button>
                      <button onClick={() => removeSub(i)} title="Delete" style={{ ...iconBtnStyle, color: "var(--expense)" }}><Trash2 size={13} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Input value={newSub} onChange={e => setNewSub(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }}
              placeholder="Add a subcategory…" style={{ flex: 1 }} />
            <Btn variant="subtle" icon={Plus} onClick={addSub}>Add</Btn>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn icon={Check} onClick={handleSave} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
