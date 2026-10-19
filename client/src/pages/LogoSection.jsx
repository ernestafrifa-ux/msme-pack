import { useRef, useState } from 'react';
import { api, uploadBlob } from '../api';
import { useSession } from '../session.jsx';
import BizLogo from '../BizLogo.jsx';
import { FormError } from '../components.jsx';

// Shrinks a photo to at most 400 px on its longest side, so it uploads quickly on mobile data.
function shrink(file, max = 400) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((webp) => {
        if (webp && webp.type === 'image/webp') return resolve(webp);
        canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('That picture could not be read.'))), 'image/png');
      }, 'image/webp', 0.9);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture we can use.')); };
    img.src = url;
  });
}

// Settings: the business logo, shown on Home, invoices and statements.
export default function LogoSection() {
  const { business, updateBusiness } = useSession();
  const canManage = ['owner', 'manager'].includes(business.role);
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState('');

  async function choose(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setMessage(''); setSaved('');
    try {
      const blob = await shrink(file);
      const d = await uploadBlob(`/businesses/${business.id}/logo`, blob);
      updateBusiness({ ...business, logoUrl: d.logoUrl });
      setSaved('Logo saved. It now shows on Home, your invoices and statements.');
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setMessage(''); setSaved('');
    try {
      await api(`/businesses/${business.id}/logo`, { method: 'DELETE' });
      updateBusiness({ ...business, logoUrl: null });
      setSaved('Logo removed.');
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }

  return (
    <section className="card logo-card" aria-labelledby="logo-head">
      <BizLogo business={business} size={72} />
      <div className="logo-main">
        <h2 id="logo-head">Business logo</h2>
        <p className="muted small">Shown on Home, your invoices and statements. A square picture works best.</p>
        <FormError message={message} />
        {saved && <p className="small" role="status">{saved}</p>}
        {canManage && (
          <div className="asset-actions">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={choose} aria-label="Choose a logo picture" />
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => input.current.click()}>
              {busy ? 'Saving…' : business.logoUrl ? 'Change logo' : 'Upload logo'}
            </button>
            {business.logoUrl && <button type="button" className="btn-link small danger" disabled={busy} onClick={remove}>Remove</button>}
          </div>
        )}
      </div>
    </section>
  );
}
