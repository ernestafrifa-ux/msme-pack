import { useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, TopBar } from '../components.jsx';

// Required after being given a temporary password; also used from Settings.
export default function ChangePassword({ required = false, onDone }) {
  const { user, updateUser, logout } = useSession();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', again: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErrors({}); setMessage(''); setSaved('');
    if (f.newPassword !== f.again) { setErrors({ again: 'The two new passwords are not the same.' }); return; }
    setBusy(true);
    try {
      const d = await api('/auth/change-password', { method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
      setF({ currentPassword: '', newPassword: '', again: '' });
      if (required) updateUser(d.user);
      else setSaved('Password changed.');
      onDone?.();
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  }

  return (
    <main className={required ? 'screen auth' : 'screen'}>
      {required ? <h1>Choose your own password</h1> : <TopBar title="Change password" back="/settings" />}
      {required && (
        <p className="lead">Hello {user.fullName.split(' ')[0]}. You logged in with a temporary password. Choose a password that only you know before you continue.</p>
      )}
      <form className="stack" onSubmit={submit} noValidate>
        <FormError message={message} />
        {saved && <div className="flash" role="status">{saved}</div>}
        <Field label={required ? 'Temporary password' : 'Current password'} error={errors.currentPassword}>
          {(p) => <input {...p} type="password" autoComplete="current-password" value={f.currentPassword} onChange={set('currentPassword')} />}
        </Field>
        <Field label="New password" error={errors.newPassword} hint="At least 8 characters.">
          {(p) => <input {...p} type="password" autoComplete="new-password" value={f.newPassword} onChange={set('newPassword')} />}
        </Field>
        <Field label="New password again" error={errors.again}>
          {(p) => <input {...p} type="password" autoComplete="new-password" value={f.again} onChange={set('again')} />}
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        {required && <button type="button" className="btn btn-ghost btn-block" onClick={logout}>Log out</button>}
      </form>
    </main>
  );
}
