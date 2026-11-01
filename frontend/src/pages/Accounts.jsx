import { useState } from "react";
import { Plus, Pencil, Trash2, Banknote, Landmark } from "lucide-react";
import { Card, PageHeader, EmptyState, ReadOnlyNotice, Btn, Modal, iconBtnStyle, Toast } from "../ui-atoms.jsx";
import { NameModal } from "../name-modal.jsx";
import { fmt, fmtPlain } from "../format.js";
import { api } from "../api.js";

export function AccountsPage({ accounts, accountBalances, reload, canEdit }) {
  const [modal, setModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const cashAccounts = accounts.filter(a => a.kind === "cash");
  const bankAccounts = accounts.filter(a => a.kind === "bank");

  const saveAccount = async (vals) => {
    setBusy(true);
    try {
      if (modal.mode === "new") {
        await api.createAccount({ name: vals.name, accNo: vals.accNo, opening: parseFloat(vals.opening) || 0 });
      } else {
        await api.updateAccount(modal.account.id, { name: vals.name, accNo: vals.accNo, opening: parseFloat(vals.opening) || 0 });
      }
      setModal(null);
      await reload();
    } catch (err) {
      setToastMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveCashAccount = async (vals) => {
    setBusy(true);
    try {
      await api.updateAccount(modal.account.id, { name: vals.name, opening: parseFloat(vals.opening) || 0 });
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
      await api.deleteAccount(id);
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
      <PageHeader title="Bank & Cash Accounts" subtitle="Manage bank accounts and cash in hand"
        action={canEdit && <Btn icon={Plus} onClick={() => setModal({ mode: "new" })}>Add bank account</Btn>} />

      {!canEdit && <ReadOnlyNotice />}

      <Card title="Cash accounts">
        {cashAccounts.map(a => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--paper-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Banknote size={19} color="var(--gold)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>Opening balance {fmt(a.opening)}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="num" style={{ fontSize: 19, fontWeight: 700 }}>{fmt(accountBalances[a.id])}</div>
              {canEdit && <button onClick={() => setModal({ mode: "edit-cash", account: a })} title="Edit" style={iconBtnStyle}><Pencil size={15} /></button>}
            </div>
          </div>
        ))}
        <div style={{ padding: "10px 18px", fontSize: 12, color: "var(--ink-faint)" }}>
          Cash accounts can be renamed and have their opening balance adjusted, but cannot be deleted, to preserve the audit trail.
        </div>
      </Card>

      <div style={{ height: 18 }} />

      <Card title="Bank accounts">
        {bankAccounts.length === 0 ? (
          <EmptyState icon={Landmark} title="No bank accounts" body="Add the church's bank accounts to start recording cheque receipts, bank payments and transfers." />
        ) : (
          <table>
            <thead><tr><th>Account name</th><th>Account number</th><th>Opening balance</th><th style={{ textAlign: "right" }}>Current balance</th>{canEdit && <th></th>}</tr></thead>
            <tbody>
              {bankAccounts.map(a => (
                <tr key={a.id} className="amt-row">
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{a.accNo}</td>
                  <td className="num" style={{ color: "var(--ink-faint)" }}>{fmtPlain(a.opening)}</td>
                  <td className="num" style={{ fontSize: 15 }}>{fmt(accountBalances[a.id])}</td>
                  {canEdit && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button onClick={() => setModal({ mode: "edit", account: a })} title="Edit" style={iconBtnStyle}><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDelete(a)} title="Delete" style={{ ...iconBtnStyle, color: "var(--expense)" }}><Trash2 size={14} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {modal && modal.mode === "edit-cash" && (
        <NameModal title="Edit cash account"
          fields={[
            { key: "name", label: "Account name", required: true },
            { key: "opening", label: "Opening balance (GH₵)", type: "number" },
          ]}
          initial={modal.account} onClose={() => setModal(null)} onSave={saveCashAccount} />
      )}

      {modal && (modal.mode === "new" || modal.mode === "edit") && (
        <NameModal title={modal.mode === "new" ? "Add bank account" : "Edit bank account"}
          fields={[
            { key: "name", label: "Account name", required: true, placeholder: "e.g. GCB Bank - Main Account" },
            { key: "accNo", label: "Account number", required: true, placeholder: "e.g. 1021334456" },
            { key: "opening", label: "Opening balance (GH₵)", type: "number", placeholder: "0.00" },
          ]}
          initial={modal.account} onClose={() => setModal(null)} onSave={saveAccount} />
      )}

      {confirmDelete && (
        <Modal title="Delete bank account?" onClose={() => setConfirmDelete(null)} width={420}>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 0 }}>
            Delete "<strong>{confirmDelete.name}</strong>"? Past transactions linked to this account will remain in the ledger but the account will no longer be available for new entries.
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
