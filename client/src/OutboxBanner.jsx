import { useEffect, useState } from 'react';
import { flushOutbox, getOutbox, onOutboxChange, removeFromOutbox } from './api';
import { useT } from './i18n.jsx';

// Records saved on the phone while offline, waiting to be sent.
export default function OutboxBanner() {
  const { t } = useT();
  const [items, setItems] = useState(getOutbox);
  const [busy, setBusy] = useState(false);
  useEffect(() => onOutboxChange(setItems), []);
  if (!items.length) return null;
  const waiting = items.filter((i) => !i.error);
  const failed = items.filter((i) => i.error);
  return (
    <section className="outbox" role="status">
      {waiting.length > 0 && (
        <div className="outbox-row">
          <span>{t('outbox.waiting', { n: waiting.length })}</span>
          <button type="button" className="btn btn-ghost btn-small" disabled={busy}
            onClick={async () => { setBusy(true); await flushOutbox(); setBusy(false); }}>
            {busy ? t('outbox.sending') : t('outbox.send')}
          </button>
        </div>
      )}
      {failed.map((i) => (
        <div key={i.body.clientRef} className="outbox-row outbox-failed">
          <span>{t('outbox.failed', { what: i.label, why: i.error })}</span>
          <button type="button" className="btn-link small danger" onClick={() => removeFromOutbox(i.body.clientRef)}>{t('outbox.remove')}</button>
        </div>
      ))}
    </section>
  );
}
