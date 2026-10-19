import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, Icon, TopBar } from '../components.jsx';
import { money, whatsappLink } from '../format';
import ReceiptPaper from '../ReceiptPaper.jsx';
import { normalisePhone } from '../phone';
import { useT } from '../i18n.jsx';

// The owner's view of a receipt: send it on WhatsApp, copy the link, or print it.
export default function Receipt() {
  const { tt } = useT();
  const { id } = useParams();
  const { business, features } = useSession();
  const [data, setData] = useState(null);
  const [token, setToken] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => {
    api(`/businesses/${business.id}/transactions/${id}/receipt`, { method: 'POST' })
      .then(async (r) => {
        setToken(r.token);
        const res = await fetch(`/api/public/receipts/${r.token}`);
        const d = await res.json();
        setData(d);
      })
      .catch((err) => setError(err.message));
  }, [business.id, id]);

  const link = token ? `${window.location.origin}/r/${token}` : '';
  const text = data ? `Thank you for buying from ${data.business.name}. Your receipt for GHS ${money(data.receipt.amount)}: ${link}` : '';
  const intl = normalisePhone(phone);

  return (
    <main className="screen">
      <TopBar title={tt('Receipt')} back="/records" />
      {error && <div className="form-error" role="alert">{error}</div>}
      {flash && <div className="flash" role="status">{flash}</div>}
      {data && (
        <>
          <div className="stack no-print">
            <Field label={tt('Customer’s WhatsApp number (optional)')} hint={tt('Leave empty to choose the person in WhatsApp')}>
              {(p) => <input {...p} type="tel" inputMode="tel" placeholder="024 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />}
            </Field>
            <a className="btn btn-primary btn-block" href={whatsappLink(intl || '', text)} target="_blank" rel="noopener noreferrer">
              <Icon name="share" size={20} /> {tt('Send on WhatsApp')}</a>
            {features?.sms && (
              <button type="button" className="btn btn-ghost btn-block" disabled={!intl}
                onClick={() => api(`/businesses/${business.id}/transactions/${id}/receipt/sms`, { method: 'POST', body: { phone } })
                  .then(() => setFlash(tt('Receipt sent by SMS to {phone}.', { phone }))).catch((err) => setFlash(err.message))}>
                {tt('Send by SMS')}{!intl ? tt(' (enter the number first)') : ''}
              </button>
            )}
            <div className="grid-2">
              <button type="button" className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(link).then(() => setFlash(tt('Link copied. Paste it in SMS or email.')), () => setFlash(link))}>
                <Icon name="copy" size={18} /> {tt('Copy link')}</button>
              <a className="btn btn-ghost" href={`/r/${token}`} target="_blank" rel="noopener noreferrer"><Icon name="print" size={18} /> {tt('Print / PDF')}</a>
            </div>
          </div>
          <h2 className="date-head no-print">{tt('What your customer sees')}</h2>
          <ReceiptPaper business={data.business} receipt={data.receipt} />
        </>
      )}
    </main>
  );
}
