import { useState, useEffect, useMemo } from "react";
import { Plus, Pencil, Trash2, Check, AlertTriangle, Users, RotateCcw, Copy, Download } from "lucide-react";
import { Card, PageHeader, EmptyState, Btn, Modal, Field, Input, Select, Pill, iconBtnStyle, Toast } from "../ui-atoms.jsx";
import { api } from "../api.js";

export function AdminPage({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userModal, setUserModal] = useState(null);
  const [roleModal, setRoleModal] = useState(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [confirmDeleteRole, setConfirmDeleteRole] = useState(null);
  const [credentialReveal, setCredentialReveal] = useState(null); // { name, username, tempPassword }
  const [toastMsg, setToastMsg] = useState("");
  const [backingUp, setBackingUp] = useState(false);

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      await api.downloadBackup();
      setToastMsg("Downloaded — save this file somewhere safe, outside this computer if possible.");
    } catch (err) {
      setToastMsg(err.message);
    } finally {
      setBackingUp(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([api.getUsers(), api.getRoles()]);
      setUsers(u);
      setRoles(r);
    } catch (err) {
      setToastMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const roleLookup = useMemo(() => {
    const map = {};
    roles.forEach(r => map[r.id] = r);
    return map;
  }, [roles]);

  const saveUser = async (vals) => {
    if (!vals.roleId) { setToastMsg("Select a role for this person."); return; }
    try {
      if (userModal.mode === "new") {
        const created = await api.createUser(vals);
        setUserModal(null);
        await load();
        setCredentialReveal({ name: created.name, username: created.username, tempPassword: created.tempPassword });
      } else {
        await api.updateUser(userModal.user.id, vals);
        setUserModal(null);
        await load();
      }
    } catch (err) {
      setToastMsg(err.message);
    }
  };

  const doDeleteUser = async (id) => {
    try {
      await api.deleteUser(id);
      setConfirmDeleteUser(null);
      await load();
    } catch (err) {
      setToastMsg(err.message);
      setConfirmDeleteUser(null);
    }
  };

  const doResetPassword = async (user) => {
    try {
      const { tempPassword } = await api.resetUserPassword(user.id);
      setCredentialReveal({ name: user.name, username: user.username, tempPassword });
    } catch (err) {
      setToastMsg(err.message);
    }
  };

  const saveRole = async (vals) => {
    const canEdit = vals.canEdit === "full";
    const canSeeNotes = vals.canEdit === "full" || vals.canEdit === "audit";
    const canAdmin = !!vals.canAdmin;
    try {
      if (roleModal.mode === "new") await api.createRole({ name: vals.name, canEdit, canSeeNotes, canAdmin });
      else await api.updateRole(roleModal.role.id, { name: vals.name, canEdit, canSeeNotes, canAdmin });
      setRoleModal(null);
      await load();
    } catch (err) {
      setToastMsg(err.message);
    }
  };

  const doDeleteRole = async (id) => {
    try {
      await api.deleteRole(id);
      setConfirmDeleteRole(null);
      await load();
    } catch (err) {
      setToastMsg(err.message);
      setConfirmDeleteRole(null);
    }
  };

  if (loading) {
    return <div style={{ padding: 60, textAlign: "center", color: "var(--ink-faint)" }}>Loading…</div>;
  }

  return (
    <div>
      <Toast message={toastMsg} onDismiss={() => setToastMsg("")} tone={toastMsg.startsWith("Downloaded") ? "success" : "error"} />
      <PageHeader title="Admin" subtitle="Manage who has access and what each role can do — Treasurer only"
        action={<Btn variant="ghost" icon={Download} onClick={handleBackup} disabled={backingUp}>{backingUp ? "Preparing…" : "Download backup"}</Btn>} />

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18, alignItems: "start" }}>
        <Card title="Users" right={<Btn small icon={Plus} onClick={() => setUserModal({ mode: "new" })}>Add person</Btn>}>
          {users.length === 0 ? (
            <EmptyState icon={Users} title="No users yet" body="Add the people who need access to this system." />
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Contact</th><th style={{ width: 100 }}></th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="amt-row">
                    <td style={{ fontWeight: 600 }}>
                      {u.name}{u.id === currentUserId && <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, marginLeft: 6 }}>(you)</span>}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--ink-soft)" }}>{u.username}</td>
                    <td>
                      <Pill tone={roleLookup[u.roleId]?.canEdit ? "income" : "neutral"}>{roleLookup[u.roleId]?.name || "No role"}</Pill>
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                      {u.phone && <div>{u.phone}</div>}
                      {u.email && <div style={{ color: "var(--ink-faint)" }}>{u.email}</div>}
                      {!u.phone && !u.email && <span style={{ color: "var(--ink-faint)" }}>—</span>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button onClick={() => doResetPassword(u)} title="Reset password" style={iconBtnStyle}><RotateCcw size={14} /></button>
                      <button onClick={() => setUserModal({ mode: "edit", user: u })} title="Edit" style={iconBtnStyle}><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDeleteUser(u)} title="Delete" style={{ ...iconBtnStyle, color: "var(--expense)" }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Roles" right={<Btn small icon={Plus} onClick={() => setRoleModal({ mode: "new" })}>Add role</Btn>}>
          {roles.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 18px", borderBottom: "1px solid var(--line)" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>
                  {r.canEdit ? "Full access" : r.canSeeNotes ? "Read-only, sees notes" : "Reports only"}
                  {r.canAdmin ? " · Admin" : ""}
                  {r.userCount ? ` · ${r.userCount} ${r.userCount === 1 ? "person" : "people"}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                <button onClick={() => setRoleModal({ mode: "edit", role: r })} title="Edit" style={iconBtnStyle}><Pencil size={14} /></button>
                <button onClick={() => setConfirmDeleteRole(r)} title="Delete" style={{ ...iconBtnStyle, color: "var(--expense)" }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {userModal && (
        <UserEditor mode={userModal.mode} user={userModal.user} roles={roles}
          onClose={() => setUserModal(null)} onSave={saveUser} />
      )}
      {roleModal && (
        <RoleEditor mode={roleModal.mode} role={roleModal.role}
          onClose={() => setRoleModal(null)} onSave={saveRole} />
      )}

      {credentialReveal && (
        <CredentialRevealModal credential={credentialReveal} onClose={() => setCredentialReveal(null)} />
      )}

      {confirmDeleteUser && (
        <Modal title="Remove this person?" onClose={() => setConfirmDeleteUser(null)} width={400}>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 0 }}>
            Remove "<strong>{confirmDeleteUser.name}</strong>"? They'll no longer be able to sign in.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
            <Btn variant="ghost" onClick={() => setConfirmDeleteUser(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => doDeleteUser(confirmDeleteUser.id)} icon={Trash2}>Remove</Btn>
          </div>
        </Modal>
      )}
      {confirmDeleteRole && (
        <Modal title="Delete this role?" onClose={() => setConfirmDeleteRole(null)} width={400}>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 0 }}>
            Delete "<strong>{confirmDeleteRole.name}</strong>"? This can't be undone.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
            <Btn variant="ghost" onClick={() => setConfirmDeleteRole(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => doDeleteRole(confirmDeleteRole.id)} icon={Trash2}>Delete</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Shown exactly once, right after a person is created or their password is
// reset. The temporary password is never stored anywhere retrievable —
// this dialog is the only chance to see and share it.
function CredentialRevealModal({ credential, onClose }) {
  const [copied, setCopied] = useState(false);

  const copyAll = () => {
    const text = `Username: ${credential.username}\nTemporary password: ${credential.tempPassword}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Modal title={`Login details for ${credential.name}`} onClose={onClose} width={440}>
      <div style={{ fontSize: 13, color: "var(--ink-faint)", marginBottom: 16, lineHeight: 1.5 }}>
        Share these with {credential.name} securely (in person or by phone) — this is the only time the password is shown. They'll be asked to set their own password the first time they sign in.
      </div>
      <div style={{ background: "var(--paper-2)", borderRadius: 9, padding: 16, border: "1px solid var(--line)", marginBottom: 16 }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: 0.3 }}>Username</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600 }}>{credential.username}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: 0.3 }}>Temporary password</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600 }}>{credential.tempPassword}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="subtle" icon={Copy} onClick={copyAll}>{copied ? "Copied" : "Copy both"}</Btn>
        <Btn onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  );
}

function UserEditor({ mode, user, roles, onClose, onSave }) {
  const [name, setName] = useState(user?.name || "");
  const [roleId, setRoleId] = useState(user?.roleId || roles[0]?.id || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState(user?.email || (mode === "new" ? "ssdatreasury@outlook.com" : ""));
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!name.trim()) { setError("Name is required."); return; }
    if (!roleId) { setError("Select a role."); return; }
    setError("");
    onSave({ name: name.trim(), roleId, phone, email });
  };

  return (
    <Modal title={mode === "new" ? "Add person" : "Edit person"} onClose={onClose} width={440}>
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
        <Field label="Full name *">
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mensah, K." />
        </Field>
        <Field label="Role *">
          <Select value={roleId} onChange={e => setRoleId(e.target.value)}>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Phone number" hint="Optional">
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +233 24 123 4567" />
        </Field>
        <Field label="Email address" hint="Optional">
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. name@example.com" />
        </Field>
        {mode === "new" && (
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 14, lineHeight: 1.5 }}>
            A username and temporary password will be generated automatically and shown once you save.
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} onClick={handleSave}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}

function RoleEditor({ mode, role, onClose, onSave }) {
  const initialLevel = role ? (role.canEdit ? "full" : role.canSeeNotes ? "audit" : "view") : "view";
  const [name, setName] = useState(role?.name || "");
  const [level, setLevel] = useState(initialLevel);
  const [canAdmin, setCanAdmin] = useState(!!role?.canAdmin);
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!name.trim()) { setError("Role name is required."); return; }
    setError("");
    // Admin access only makes sense alongside full edit access — if the
    // level changes away from "full", drop any admin grant along with it
    // rather than leaving a role that can see Admin but can't actually
    // edit anything, which would be a confusing combination.
    onSave({ name: name.trim(), canEdit: level, canAdmin: level === "full" ? canAdmin : false });
  };

  const LEVELS = [
    { id: "full", label: "Full access", hint: "Can add, edit, and delete records throughout the system." },
    { id: "audit", label: "Read-only, sees notes", hint: "Can view everything including audit notes, but can't make changes." },
    { id: "view", label: "Reports only", hint: "Can view reports and dashboards only." },
  ];

  return (
    <Modal title={mode === "new" ? "Add role" : "Edit role"} onClose={onClose} width={460}>
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
        <Field label="Role name *">
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Finance Committee" />
        </Field>
        <Field label="Access level *">
          <div>
            {LEVELS.map(lv => (
              <label key={lv.id} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8,
                border: "1px solid " + (level === lv.id ? "var(--ink)" : "var(--line)"),
                background: level === lv.id ? "var(--paper-3)" : "var(--paper)", marginBottom: 8, cursor: "pointer",
              }}>
                <input type="radio" checked={level === lv.id} onChange={() => setLevel(lv.id)} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{lv.label}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>{lv.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </Field>
        {level === "full" && (
          <Field label="Admin access" hint="Lets this role manage Users and Roles, and download database backups. Most full-access roles (e.g. Assistant Treasurer, Data Entry) should leave this off.">
            <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
              <input type="checkbox" checked={canAdmin} onChange={e => setCanAdmin(e.target.checked)} />
              <span style={{ fontSize: 13.5 }}>Can access the Admin page</span>
            </label>
          </Field>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} onClick={handleSave}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}
