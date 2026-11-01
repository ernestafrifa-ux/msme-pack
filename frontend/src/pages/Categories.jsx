import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, FolderTree, Search } from "lucide-react";
import { Card, PageHeader, EmptyState, ReadOnlyNotice, Btn, Modal, Input, iconBtnStyle, Toast } from "../ui-atoms.jsx";
import { NameModal } from "../name-modal.jsx";
import { CategoryEditor } from "../category-editor.jsx";
import { api } from "../api.js";

export function CategoriesPage({ incomeCats, expenseCats, reload, canEdit }) {
  const [tab, setTab] = useState("income");
  const [search, setSearch] = useState("");

  const allCats = tab === "income" ? incomeCats : expenseCats;
  const cats = useMemo(() => {
    if (!search.trim()) return allCats;
    const q = search.toLowerCase();
    return allCats.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.noteNo && String(c.noteNo).includes(q)) ||
      c.subs.some(s => s.toLowerCase().includes(q))
    );
  }, [allCats, search]);

  const [expanded, setExpanded] = useState({});
  const [catModal, setCatModal] = useState(null); // {mode:'new'} or {mode:'edit', cat}
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const saveNewCat = async (vals) => {
    setBusy(true);
    try {
      const noteNo = vals.noteNo ? parseInt(vals.noteNo, 10) : null;
      await api.createCategory({ kind: tab, name: vals.name, noteNo });
      setCatModal(null);
      await reload();
    } catch (err) {
      setToastMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const updateCat = async (catId, updatedFields) => {
    setBusy(true);
    try {
      await api.updateCategory(catId, updatedFields);
      setCatModal(null);
      await reload();
    } catch (err) {
      setToastMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.deleteCategory(confirmDelete.catId);
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
      <PageHeader title="Categories" subtitle="Income and expenditure categories, numbered to match the church's audited financial statement notes"
        action={canEdit && <Btn icon={Plus} onClick={() => setCatModal({ mode: "new" })}>Add category</Btn>} />

      {!canEdit && <ReadOnlyNotice />}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 11, color: "var(--ink-faint)", pointerEvents: "none" }} />
          <Input placeholder="Search categories or subcategories…" value={search} onChange={e => { setSearch(e.target.value); }} style={{ paddingLeft: 34 }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[{ k: "income", l: "Income categories", n: incomeCats.length }, { k: "expense", l: "Expenditure categories", n: expenseCats.length }].map(t => (
          <button key={t.k} onClick={() => { setTab(t.k); setSearch(""); }} style={{
            padding: "9px 16px", borderRadius: 9, border: "1px solid " + (tab === t.k ? "var(--ink)" : "var(--line)"),
            background: tab === t.k ? "var(--ink)" : "var(--paper)", color: tab === t.k ? "var(--paper)" : "var(--ink-soft)",
            fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 7
          }}>
            {t.l} <span style={{ background: tab === t.k ? "rgba(251,248,242,0.2)" : "var(--paper-3)", padding: "1px 7px", borderRadius: 10, fontSize: 11.5 }}>{t.n}</span>
          </button>
        ))}
      </div>

      <Card title="">
        {cats.length === 0 ? (
          <EmptyState icon={FolderTree} title="No categories yet" body="Add a category to start classifying transactions." />
        ) : (
          <div>
            {[...cats].sort((a, b) => (a.noteNo || 999) - (b.noteNo || 999)).map(c => (
              <div key={c.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", padding: "11px 14px", gap: 8 }}>
                  <button onClick={() => toggle(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-faint)", padding: 2, display: "flex" }}>
                    {c.subs.length > 0 ? (expanded[c.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span style={{ width: 16 }} />}
                  </button>
                  {c.noteNo && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-faint)", minWidth: 22 }}>{c.noteNo}.</span>}
                  <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1, cursor: "pointer" }} onClick={() => canEdit && setCatModal({ mode: "edit", cat: c })}>{c.name}</span>
                  {c.subs.length > 0 && <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{c.subs.length} subcategor{c.subs.length === 1 ? "y" : "ies"}</span>}
                  {canEdit && (
                    <div style={{ display: "flex", gap: 2 }}>
                      <button onClick={() => setCatModal({ mode: "edit", cat: c })} title="Edit category and subcategories" style={iconBtnStyle}><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDelete({ catId: c.id, label: c.name })} title="Delete category" style={{ ...iconBtnStyle, color: "var(--expense)" }}><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
                {expanded[c.id] && c.subs.length > 0 && (
                  <div style={{ paddingLeft: 52, paddingBottom: 6 }}>
                    {c.subs.map(s => (
                      <div key={s} style={{ display: "flex", alignItems: "center", padding: "7px 14px 7px 0", gap: 8 }}>
                        <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--line-strong)", flexShrink: 0 }} />
                        <span style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {catModal && catModal.mode === "new" && (
        <NameModal title={`Add ${tab} category`}
          fields={[
            { key: "name", label: "Category name", required: true, placeholder: "e.g. Building Fund" },
            { key: "noteNo", label: "Note number", hint: "Matches the note reference in your annual financial statement. Leave blank if none.", type: "number", placeholder: "e.g. 15" },
          ]}
          onClose={() => setCatModal(null)} onSave={saveNewCat} />
      )}
      {catModal && catModal.mode === "edit" && (
        <CategoryEditor
          cat={cats.find(c => c.id === catModal.cat.id) || catModal.cat}
          onClose={() => setCatModal(null)}
          onUpdate={(fields) => updateCat(catModal.cat.id, fields)}
          busy={busy}
        />
      )}
      {confirmDelete && (
        <Modal title="Delete category?" onClose={() => setConfirmDelete(null)} width={400}>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 0 }}>
            Delete "<strong>{confirmDelete.label}</strong>"? Existing transactions recorded under it will keep showing this name, but it won't be available for new entries.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
            <Btn variant="ghost" onClick={() => setConfirmDelete(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="danger" onClick={doDelete} icon={Trash2} disabled={busy}>{busy ? "Deleting…" : "Delete"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
