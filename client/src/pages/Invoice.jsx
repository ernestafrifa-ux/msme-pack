import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, newClientRef } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, Icon, StatusPill, TopBar } from '../components.jsx';
import InvoicePaper from '../InvoicePaper.jsx';
import { money, longDate, todayGhana, friendlyDate, INVOICE_STATUS, whatsappLink } from '../format';
import { WHT, whtOn } from '../tax';
import { useT } from '../i18n.jsx';

export default function Invoice() {
  const { tt } = useT();
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { business } = useSession();
  const [inv, setInv] = useState(null);
  const [biz, setBiz] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(
    location.state?.justSaved ? (location.state.openSend ? tt('Saved. Now send it to your customer.') : tt('Draft saved.')) : ''
  );
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState({ amount: '', accountId: '', date: todayGhana(), paymentRef: '', momoFee: '', wht: '' });
  const [withheld, setWithheld] = useState(false);
  const [payRef, setPayRef] = useState(newClientRef);
  const [payErrors, setPayErrors] = useState({});
  const [payMessage, setPayMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = ['owner', 'manager'].includes(business.role);
  const base = `/businesses/${business.id}`;

  const load = useCallback(() => {
    api(`${base}/invoices/${invoiceId}`).then((d) => setInv(d.invoice)).catch((err) => setError(err.message));
  }, [base, invoiceId]);

  useEffect(() => {
    load();
    api(`${base}`).then((d) => setBiz(d.business)).catch(() => {});
    api(`${base}/accounts`).then((d) => setAccounts(d.accounts)).catch(() => {});
  }, [base, load]);

  async function act(path, body, okMessage) {
    setBusy(true);
    setError('');
    try {
      const d = await api(`${base}/invoices/${invoiceId}/${path}`, { method: 'POST', body });
      setInv(d.invoice);
      if (okMessage) setFlash(okMessage);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function startPayment() {
    const def = accounts.find((a) => a.isDefault) || accounts[0];
    setPay({ amount: inv.outstanding, accountId: def?.id || '', date: todayGhana(), paymentRef: '', momoFee: '', wht: '' });
    setWithheld(false);
    setPayRef(newClientRef());
    setPayErrors({});
    setPayMessage('');
    setPaying(true);
  }

  async function savePayment(e) {
    e.preventDefault();
    setBusy(true);
    setPayErrors({});
    setPayMessage('');
    try {
      const d = await api(`${base}/invoices/${invoiceId}/payments`, {
        method: 'POST',
        body: { ...pay, momoFee: pay.momoFee || 0, wht: withheld ? pay.wht || 0 : 0, paymentRef: pay.paymentRef || null, clientRef: payRef },
      });
      setInv(d.invoice);
      setPaying(false);
      setFlash(d.invoice.status === 'paid' ? tt('Payment saved. This invoice is fully paid.') : tt('Payment of GHS {amount} saved.', { amount: money(pay.amount) }));
    } catch (err) {
      setPayErrors(err.fields || {});
      setPayMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeDraft() {
    if (!window.confirm(tt('Delete draft {number}?', { number: inv.number }))) return;
    try {
      await api(`${base}/invoices/${invoiceId}`, { method: 'DELETE' });
      navigate('/invoices', { replace: true, state: { flash: tt('Draft {number} deleted.', { number: inv.number }) } });
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancelInvoice() {
    if (!window.confirm(tt('Cancel {number}? Any products on it go back into stock.', { number: inv.number }))) return;
    act('void', undefined, 'Invoice cancelled. Products went back into stock.');
  }

  if (!inv) {
    return (
      <main className="screen">
        <TopBar title={tt('Invoice')} back="/invoices" />
        {error ? <div className="form-error" role="alert">{error}</div> : <p role="status">{tt('Loading…')}</p>}
      </main>
    );
  }

  const link = `${window.location.origin}/i/${inv.shareToken}`;
  const firstName = inv.contact?.name?.split(' ')[0] || '';
  const bizName = biz?.name || business.name;
  const payBy = inv.dueDate ? ` (pay by ${longDate(inv.dueDate)})` : ''; // the customer's message stays in English
  let waText;
  if (inv.status === 'draft' || inv.status === 'sent') {
    waText = `Hello ${firstName}, here is invoice ${inv.number} from ${bizName} for GHS ${money(inv.total)}${payBy}. View it here: ${link}`;
  } else if (inv.status === 'paid') {
    waText = `Hello ${firstName}, thank you. We have received full payment for invoice ${inv.number} (GHS ${money(inv.total)}). ${link}`;
  } else {
    waText = `Hello ${firstName}, a reminder that GHS ${money(inv.outstanding)} is still due on invoice ${inv.number} from ${bizName}${payBy}. ${link}`;
  }
  const waHref = whatsappLink(inv.contact?.phone, waText);
  const isOpen = ['sent', 'part_paid', 'overdue'].includes(inv.status);
  const payAccount = accounts.find((a) => a.id === pay.accountId);

  return (
    <main className="screen">
      <TopBar title={inv.number} back="/invoices"
        right={inv.status === 'draft' ? <Link to={`/invoices/${invoiceId}/edit`} className="btn-link">{tt('Edit')}</Link> : null} />
      {flash && <div className="flash" role="status">{flash}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="card inv-summary">
        <div>
          <div className="muted small">{inv.status === 'paid' || inv.status === 'draft' || inv.status === 'void' ? tt('Total') : tt('Still owed')}</div>
          <div className="inv-amount">GHS {money(isOpen ? inv.outstanding : inv.total)}</div>
          <div className="muted small">
            {inv.contact?.name}
            {Number(inv.paid) > 0 && isOpen ? tt(' · paid {amount} of {amount2}', { amount: money(inv.paid), amount2: money(inv.total) }) : ''}
          </div>
        </div>
        <StatusPill status={inv.status} label={INVOICE_STATUS[inv.status]} />
      </section>

      <div className="inv-actions">
        {inv.status === 'draft' && (
          <>
            <a className="btn btn-primary btn-block" href={waHref} target="_blank" rel="noopener noreferrer"
              onClick={() => act('send', { via: 'whatsapp' }, 'Marked as sent. Products on it left stock.')}>
              <Icon name="share" size={20} /> {tt('Send on WhatsApp')}</a>
            <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => act('send', { via: 'print' }, 'Marked as sent. Products on it left stock.')}>{tt('I gave it another way (mark as sent)')}</button>
            <p className="muted small">{tt('Sending takes the products on this invoice out of your stock.')}</p>
          </>
        )}

        {isOpen && !paying && (
          <>
            <button className="btn btn-primary btn-block" onClick={startPayment} disabled={!accounts.length}>{tt('Record money received')}</button>
            <a className="btn btn-ghost btn-block" href={waHref} target="_blank" rel="noopener noreferrer"
              onClick={() => act('send', { via: 'whatsapp' })}>
              <Icon name="share" size={20} /> {inv.status === 'sent' ? tt('Send again on WhatsApp') : tt('Send reminder on WhatsApp')}
            </a>
          </>
        )}

        {paying && (
          <form className="card stack" onSubmit={savePayment} noValidate>
            <h2>{tt('Money received')}</h2>
            <FormError message={payMessage} />
            <Field label={tt('Amount (GHS) · {amount} owed', { amount: money(inv.outstanding) })} error={payErrors.amount}>
              {(p) => <input {...p} className="amount-input" type="number" inputMode="decimal" min="0" step="0.01"
                value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />}
            </Field>
            <fieldset className="field">
              <legend>{tt('Where did the money go?')}</legend>
              <div className="chips">
                {accounts.map((a) => (
                  <label key={a.id} className={'chip chip-lg' + (pay.accountId === a.id ? ' chip-on' : '')}>
                    <input type="radio" name="payAccount" value={a.id} checked={pay.accountId === a.id}
                      onChange={() => setPay({ ...pay, accountId: a.id })} />
                    {a.name}
                  </label>
                ))}
              </div>
              {payErrors.accountId && <div className="field-error">{payErrors.accountId}</div>}
            </fieldset>
            {payAccount?.kind === 'mobile_money' && (
              <div className="grid-2">
                <Field label={tt('MoMo ID (optional)')} error={payErrors.paymentRef}>
                  {(p) => <input {...p} value={pay.paymentRef} onChange={(e) => setPay({ ...pay, paymentRef: e.target.value })} />}
                </Field>
                <Field label={tt('MoMo fee (optional)')} error={payErrors.momoFee}>
                  {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                    value={pay.momoFee} onChange={(e) => setPay({ ...pay, momoFee: e.target.value })} />}
                </Field>
              </div>
            )}
            <label className="check-row">
              <input type="checkbox" checked={withheld} onChange={(e) => {
                setWithheld(e.target.checked);
                if (!e.target.checked) setPay({ ...pay, wht: '', amount: inv.outstanding });
              }} />
              <span>{tt('The customer kept back withholding tax')}</span>
            </label>
            {withheld && (() => {
              // WHT is worked out on the price before VAT, NHIL and GETFund.
              const owedShare = Number(inv.total) > 0 ? Number(inv.outstanding) / Number(inv.total) : 0;
              const exclusive = Math.round(Number(inv.taxable ?? inv.total) * owedShare * 100) / 100;
              const below = Number(inv.taxable ?? inv.total) <= WHT.threshold;
              const suggest = (kind) => {
                const w = Math.round(exclusive * WHT[kind]) / 100;
                setPay({ ...pay, wht: w.toFixed(2), amount: (Number(inv.outstanding) - w).toFixed(2) });
              };
              return (
                <div className="stack">
                  <p className="muted small">
                    {below
                      ? tt('This invoice is GHS {amount} or less before tax, so customers usually do not withhold tax on it.', { amount: money(WHT.threshold) })
                      : tt('Withholding tax is worked out on the amount before tax (GHS {amount} still owed). Ask the customer for the WHT certificate: it counts against your income tax.', { amount: money(exclusive) })}
                  </p>
                  {!below && (
                    <div className="grid-2">
                      <button type="button" className="btn btn-ghost" onClick={() => suggest('goods')}>{tt('Goods')} 3%: {money(whtOn(exclusive, 'goods'))}</button>
                      <button type="button" className="btn btn-ghost" onClick={() => suggest('services')}>{tt('Services')} 7.5%: {money(whtOn(exclusive, 'services'))}</button>
                    </div>
                  )}
                  <Field label={tt('Tax withheld (GHS)')} error={payErrors.wht}>
                    {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                      value={pay.wht} onChange={(e) => setPay({ ...pay, wht: e.target.value })} />}
                  </Field>
                  <p className="muted small">{tt('Money received {received} + tax withheld {wht} = {total} of {owed} owed.', { received: money(pay.amount || 0), wht: money(pay.wht || 0), total: money(Number(pay.amount || 0) + Number(pay.wht || 0)), owed: money(inv.outstanding) })}</p>
                </div>
              );
            })()}
            <Field label={tt('Date')} error={payErrors.date}>
              {(p) => <input {...p} type="date" min={inv.issueDate} max={todayGhana()} value={pay.date}
                onChange={(e) => setPay({ ...pay, date: e.target.value })} />}
            </Field>
            <div className="grid-2">
              <button type="button" className="btn btn-ghost" onClick={() => setPaying(false)}>{tt('Cancel')}</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? tt('Saving…') : tt('Save payment')}</button>
            </div>
          </form>
        )}

        {inv.status === 'paid' && (
          <a className="btn btn-ghost btn-block" href={waHref} target="_blank" rel="noopener noreferrer">
            <Icon name="share" size={20} /> {tt('Send thank-you on WhatsApp')}</a>
        )}

        {inv.status !== 'draft' && inv.status !== 'void' && (
          <div className="grid-2">
            <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(link).then(() => setFlash(tt('Link copied. Paste it in SMS or email.')), () => setFlash(link))}>
              <Icon name="copy" size={18} /> {tt('Copy link')}</button>
            <a className="btn btn-ghost" href={`/i/${inv.shareToken}`} target="_blank" rel="noopener noreferrer">
              <Icon name="print" size={18} /> {tt('Print / PDF')}</a>
          </div>
        )}
      </div>

      {inv.payments.length > 0 && (
        <section>
          <div className="card-head"><h2>{tt('Payments')}</h2></div>
          <ul className="txn-list">
            {inv.payments.map((p) => (
              <li key={p.id} className="txn">
                <div className={'txn-dot ' + (p.kind === 'wht' ? 'move' : 'in')} aria-hidden="true"><Icon name={p.kind === 'wht' ? 'file' : 'plus'} size={18} /></div>
                <div className="txn-main">
                  <div className="txn-title">{p.kind === 'wht' ? tt('Tax withheld by customer') : p.accountName}</div>
                  <div className="muted small">{friendlyDate(p.date)}{p.paymentRef ? ` · ${p.paymentRef}` : ''}{p.kind === 'wht' ? ' · WHT certificate' : ''}</div>
                </div>
                <div className={'txn-amt' + (p.kind === 'wht' ? '' : ' pos')}>{p.kind === 'wht' ? '' : '+'}{money(p.amount)}</div>
              </li>
            ))}
          </ul>
          <p className="muted small">{tt('To undo a payment, delete it in Records.')}</p>
        </section>
      )}

      <div className="card-head"><h2>{inv.status === 'draft' ? tt('Preview') : tt('What your customer sees')}</h2></div>
      {biz && (
        <InvoicePaper
          business={{ ...biz, region: null }}
          customer={inv.contact}
          invoice={inv}
        />
      )}

      <div className="danger-zone">
        {inv.status === 'draft' && <button className="btn-link danger-link" onClick={removeDraft}>{tt('Delete draft')}</button>}
        {canManage && isOpen && Number(inv.paid) === 0 && (
          <button className="btn-link danger-link" onClick={cancelInvoice} disabled={busy}>{tt('Cancel this invoice')}</button>
        )}
      </div>
    </main>
  );
}
