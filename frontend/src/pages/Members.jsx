import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, FileText, Mail, MessageSquare, Receipt, Users, Search } from "lucide-react";
import { Card, PageHeader, EmptyState, ReadOnlyNotice, Btn, Modal, Input, iconBtnStyle, Toast } from "../ui-atoms.jsx";
import { NameModal } from "../name-modal.jsx";
import { fmtPlain } from "../format.js";
import { api } from "../api.js";

export function MembersPage({ members, reload, slips, catLookup, canEdit }) {
  const [modal, setModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [notifyTarget, setNotifyTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [search, setSearch] = useState("");

  const givingByMember = useMemo(() => {
    const map = {};
    slips.filter(s => s.kind === "income").forEach(s => {
      s.lines.forEach(l => {
        if (l.memberId) {
          if (!map[l.memberId]) map[l.memberId] = [];
          map[l.memberId].push({ date: s.date, catId: l.catId, subName: l.subName, amount: l.amount });
        }
      });
    });
    return map;
  }, [slips]);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.envelopeNo.toLowerCase().includes(q) ||
      (m.phone && m.phone.includes(q)) ||
      (m.email && m.email.toLowerCase().includes(q))
    );
  }, [members, search]);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  useMemo(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const paginatedMembers = filteredMembers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const saveMember = async (vals) => {
    setBusy(true);
    try {
      if (modal.mode === "new") await api.createMember(vals);
      else await api.updateMember(modal.member.id, vals);
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
      await api.deleteMember(id);
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
      <PageHeader title="Members" subtitle="Member register for linking giving history to individual contributors"
        action={canEdit && <Btn icon={Plus} onClick={() => setModal({ mode: "new" })}>Add member</Btn>} />

      {!canEdit && <ReadOnlyNotice />}

      <div style={{ position: "relative", maxWidth: 340, marginBottom: 16 }}>
        <Search size={15} style={{ position: "absolute", left: 11, top: 11, color: "var(--ink-faint)", pointerEvents: "none" }} />
        <Input placeholder="Search by name, envelope no., phone…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
      </div>

      <Card title="">
        {filteredMembers.length === 0 ? (
          <EmptyState icon={Users} title={search ? "No members match your search" : "No members recorded"} body={search ? "Try a different search term." : "Add members to link tithes and offerings to individuals for giving statements."} />
        ) : (
          <>
          <table style={{ minWidth: 540 }}>
            <thead><tr>
              <th>Name</th>
              <th style={{ width: 130 }}>Envelope / Member No.</th>
              <th style={{ width: 160 }}>Contact</th>
              <th style={{ textAlign: "right", width: 120 }}>Total recorded giving</th>
              {canEdit && <th style={{ width: 110 }}></th>}
            </tr></thead>
            <tbody>
              {paginatedMembers.map(m => {
                const history = givingByMember[m.id] || [];
                const total = history.reduce((s, h) => s + h.amount, 0);
                return (
                  <tr key={m.id} className="amt-row">
                    <td style={{ fontWeight: 600, cursor: "pointer" }} onClick={() => setViewing(m)}>{m.name}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{m.envelopeNo}</td>
                    <td style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                      {m.phone && <div>{m.phone}</div>}
                      {m.email && <div style={{ color: "var(--ink-faint)" }}>{m.email}</div>}
                      {!m.phone && !m.email && <span style={{ color: "var(--ink-faint)" }}>—</span>}
                    </td>
                    <td className="num" style={{ color: "var(--income)" }}>{fmtPlain(total)}</td>
                    {canEdit && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button onClick={() => setViewing(m)} title="View giving history" style={iconBtnStyle}><FileText size={14} /></button>
                        <button onClick={() => setNotifyTarget(m)} title="Send giving notification" disabled={!m.phone && !m.email} style={{ ...iconBtnStyle, opacity: (!m.phone && !m.email) ? 0.35 : 1 }}><Mail size={14} /></button>
                        <button onClick={() => setModal({ mode: "edit", member: m })} title="Edit" style={iconBtnStyle}><Pencil size={14} /></button>
                        <button onClick={() => setConfirmDelete(m)} title="Delete" style={{ ...iconBtnStyle, color: "var(--expense)" }}><Trash2 size={14} /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={filteredMembers.length} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </Card>

      {modal && (
        <NameModal title={modal.mode === "new" ? "Add member" : "Edit member"}
          fields={[
            { key: "name", label: "Full name", required: true, placeholder: "e.g. Owusu, Grace" },
            { key: "envelopeNo", label: "Envelope / member number", required: true, placeholder: "e.g. EV-027" },
            { key: "phone", label: "Phone number", hint: "Used for SMS giving notifications", placeholder: "e.g. +233 24 123 4567" },
            { key: "email", label: "Email address", hint: "Used for email giving statements", type: "email", placeholder: "e.g. name@example.com" },
          ]}
          initial={modal.member} onClose={() => setModal(null)} onSave={saveMember} />
      )}

      {viewing && (
        <Modal title={`Giving history — ${viewing.name}`} onClose={() => setViewing(null)} width={560}>
          <div style={{ fontSize: 13, color: "var(--ink-faint)", marginBottom: 4 }}>Envelope no. {viewing.envelopeNo}</div>
          <div style={{ fontSize: 13, color: "var(--ink-faint)", marginBottom: 14 }}>
            {viewing.phone && <span>{viewing.phone}</span>}{viewing.phone && viewing.email && <span> · </span>}{viewing.email && <span>{viewing.email}</span>}
          </div>
          {(givingByMember[viewing.id] || []).length === 0 ? (
            <EmptyState icon={Receipt} title="No giving recorded yet" body="Contributions tagged to this member will appear here." />
          ) : (
            <table>
              <thead><tr><th>Date</th><th>Category</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
              <tbody>
                {(givingByMember[viewing.id] || []).sort((a, b) => b.date.localeCompare(a.date)).map((h, i) => (
                  <tr key={i} className="amt-row">
                    <td>{h.date}</td>
                    <td>{catLookup[h.catId]?.name}{h.subName ? ` · ${h.subName}` : ""}</td>
                    <td className="num" style={{ color: "var(--income)" }}>{fmtPlain(h.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 700 }} colSpan={2}>Total</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtPlain((givingByMember[viewing.id] || []).reduce((s, h) => s + h.amount, 0))}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {notifyTarget && (
        <NotifyMemberModal member={notifyTarget} history={givingByMember[notifyTarget.id] || []} catLookup={catLookup} onClose={() => setNotifyTarget(null)} />
      )}

      {confirmDelete && (
        <Modal title="Delete member?" onClose={() => setConfirmDelete(null)} width={400}>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 0 }}>
            Delete "<strong>{confirmDelete.name}</strong>"? Past transactions linked to this member will keep showing the record, but the member won't appear for new entries.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
            <Btn variant="ghost" onClick={() => setConfirmDelete(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="danger" onClick={() => doDelete(confirmDelete.id)} icon={Trash2} disabled={busy}>{busy ? "Removing…" : "Delete"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NotifyMemberModal({ member, history, catLookup, onClose }) {
  const latestDate = history.length ? [...history].map(h => h.date).sort().reverse()[0] : null;
  const latestItems = latestDate ? history.filter(h => h.date === latestDate) : [];
  const latest = latestItems.length ? latestItems[0] : null;
  const latestTotal = latestItems.reduce((s, h) => s + h.amount, 0);
  const total = history.reduce((s, h) => s + h.amount, 0);
  const itemName = (h) => `${catLookup[h.catId]?.name || ""}${h.subName ? " · " + h.subName : ""}`;
  const itemLines = latestItems.map(h => `  - ${itemName(h)}: GH₵ ${fmtPlain(h.amount)}`).join("\n");
  const itemsInline = latestItems.map(h => `${itemName(h)} GH₵ ${fmtPlain(h.amount)}`).join(", ");

  const subject = `Santasi SDA Church — giving acknowledgement`;
  const bodyText = latest
    ? (latestItems.length === 1
        ? `Dear ${member.name},\n\nThank you for your contribution of GH₵ ${fmtPlain(latest.amount)} (${itemName(latest)}) received on ${latestDate}.\n\nYour total recorded giving to date is GH₵ ${fmtPlain(total)}.\n\nGod bless you.\nSantasi SDA Church Treasury`
        : `Dear ${member.name},\n\nThank you for your contributions received on ${latestDate}:\n${itemLines}\n\nTotal received: GH₵ ${fmtPlain(latestTotal)}\n\nYour total recorded giving to date is GH₵ ${fmtPlain(total)}.\n\nGod bless you.\nSantasi SDA Church Treasury`)
    : `Dear ${member.name},\n\nThank you for your continued support of Santasi SDA Church.\n\nGod bless you.\nSantasi SDA Church Treasury`;

  const mailtoHref = `mailto:${encodeURIComponent(member.email || "")}?cc=${encodeURIComponent("ssdatreasury@outlook.com")}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
  const smsBody = latest
    ? `Santasi SDA Church: Thank you for your contribution on ${latestDate}: ${itemsInline}. God bless you.`
    : `Santasi SDA Church: Thank you for your continued support. God bless you.`;
  const smsHref = `sms:${(member.phone || "").replace(/\s+/g, "")}?body=${encodeURIComponent(smsBody)}`;

  return (
    <Modal title={`Notify ${member.name}`} onClose={onClose} width={480}>
      <div style={{ fontSize: 13, color: "var(--ink-faint)", marginBottom: 16, lineHeight: 1.5 }}>
        This opens your own email or messaging app with the note pre-filled — the system doesn't send anything on its own behalf.
      </div>

      <div style={{ background: "var(--paper-2)", borderRadius: 9, padding: 14, fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 18, whiteSpace: "pre-wrap", border: "1px solid var(--line)" }}>
        {bodyText}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {member.email ? (
          <a href={mailtoHref} style={{ textDecoration: "none" }}>
            <Btn icon={Mail}>Open in email</Btn>
          </a>
        ) : (
          <Btn icon={Mail} disabled>No email on file</Btn>
        )}
        {member.phone ? (
          <a href={smsHref} style={{ textDecoration: "none" }}>
            <Btn variant="subtle" icon={MessageSquare}>Open in messages</Btn>
          </a>
        ) : (
          <Btn variant="subtle" icon={MessageSquare} disabled>No phone on file</Btn>
        )}
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
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
