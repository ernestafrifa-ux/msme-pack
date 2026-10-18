import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Icon, TopBar } from '../components.jsx';
import { money, longDate, todayGhana, addDaysIso } from '../format';

// First and last day of the month containing `iso`, the last capped at today.
function monthRange(iso) {
  const from = `${iso.slice(0, 7)}-01`;
  const d = new Date(from + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  const end = addDaysIso(d.toISOString().slice(0, 10), -1);
  const today = todayGhana();
  return { from, to: end > today ? today : end };
}

function shiftMonth(from, n) {
  const d = new Date(from + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return monthRange(d.toISOString().slice(0, 10));
}

// The words for one line of the statement, e.g. "Expenses: Rent".
function lineLabel(row, t) {
  const base = t(`rp.line.${row.line}`);
  return row.category && row.line !== 'invoice' ? `${base}: ${row.category}` : base;
}

function toCsv(s, t) {
  const rows = [[t('rp.statement')], [s.business?.name || ''], [t('rp.period', { from: s.from, to: s.to })], []];
  rows.push([t('rp.bf'), '']);
  for (const a of s.accounts) rows.push([`  ${a.name}`, a.opening]);
  rows.push([t('rp.totalBf'), s.totals.opening], []);
  rows.push([t('rp.receipts'), '']);
  for (const r of s.receipts) rows.push([`  ${lineLabel(r, t)}`, r.amount]);
  rows.push([t('rp.totalReceipts'), s.totals.receipts], []);
  rows.push([t('rp.payments'), '']);
  for (const r of s.payments) rows.push([`  ${lineLabel(r, t)}`, r.amount]);
  rows.push([t('rp.totalPayments'), s.totals.payments], []);
  rows.push([t('rp.cf'), '']);
  for (const a of s.accounts) rows.push([`  ${a.name}`, a.closing]);
  rows.push([t('rp.totalCf'), s.totals.closing]);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

function Lines({ rows, t }) {
  if (!rows.length) return <tr><td className="muted">{t('rp.none')}</td><td className="num muted">0.00</td></tr>;
  return rows.map((r) => (
    <tr key={`${r.line}-${r.category || ''}`}>
      <td className="indent">{lineLabel(r, t)}</td>
      <td className="num">{money(r.amount)}</td>
    </tr>
  ));
}

export default function ReceiptsPayments() {
  const { business } = useSession();
  const { t } = useT();
  const [range, setRange] = useState(() => monthRange(todayGhana()));
  const [custom, setCustom] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!range.from || !range.to) return;
    setError('');
    api(`/businesses/${business.id}/reports/receipts-payments?from=${range.from}&to=${range.to}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [business.id, range.from, range.to]);

  const isCurrentMonth = range.from === monthRange(todayGhana()).from;

  function downloadCsv() {
    const blob = new Blob(['﻿' + toCsv(data, t)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipts-payments-${data.from}-to-${data.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="screen">
      <div className="no-print"><TopBar title={t('rp.title')} back="/records" /></div>

      <div className="no-print">
        {!custom ? (
          <div className="month-step">
            <button type="button" className="icon-btn" aria-label={t('rp.prev')}
              onClick={() => setRange(shiftMonth(range.from, -1))}><Icon name="back" /></button>
            <span className="month-step-label">{t('rp.period', { from: longDate(range.from, t), to: longDate(range.to, t) })}</span>
            <button type="button" className="icon-btn" aria-label={t('rp.next')} disabled={isCurrentMonth}
              onClick={() => setRange(shiftMonth(range.from, 1))}><Icon name="chevron" /></button>
          </div>
        ) : (
          <div className="grid-2">
            <label className="field"><span className="field-label">{t('rp.from')}</span>
              <input type="date" value={range.from} max={range.to}
                onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
            <label className="field"><span className="field-label">{t('rp.to')}</span>
              <input type="date" value={range.to} min={range.from}
                onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
          </div>
        )}
        <button type="button" className="btn-link small" onClick={() => {
          if (custom) setRange(monthRange(todayGhana()));
          setCustom(!custom);
        }}>{custom ? t('rp.byMonth') : t('rp.choose')}</button>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      {data && (
        <>
          <article className="paper statement" aria-label={t('rp.statement')}>
            <div className="statement-head">
              <div className="statement-biz">{data.business?.name}</div>
              <h1>{t('rp.statement')}</h1>
              <div className="paper-muted">{t('rp.period', { from: longDate(data.from, t), to: longDate(data.to, t) })}</div>
            </div>
            <table className="statement-table">
              <tbody>
                <tr className="head"><th colSpan="2">{t('rp.bf')}</th></tr>
                {data.accounts.map((a) => (
                  <tr key={`bf-${a.id}`}>
                    <td className="indent">{a.name}{a.openedOn > data.from ? <span className="paper-muted"> ({t('rp.atSetup', { date: longDate(a.openedOn, t) })})</span> : null}</td>
                    <td className="num">{money(a.opening)}</td>
                  </tr>
                ))}
                <tr className="subtotal"><td>{t('rp.totalBf')}</td><td className="num">{money(data.totals.opening)}</td></tr>

                <tr className="head"><th colSpan="2">{t('rp.receipts')}</th></tr>
                <Lines rows={data.receipts} t={t} />
                <tr className="subtotal"><td>{t('rp.totalReceipts')}</td><td className="num">{money(data.totals.receipts)}</td></tr>
                <tr className="subtotal"><td>{t('rp.available')}</td>
                  <td className="num">{money(Number(data.totals.opening) + Number(data.totals.receipts))}</td></tr>

                <tr className="head"><th colSpan="2">{t('rp.payments')}</th></tr>
                <Lines rows={data.payments} t={t} />
                <tr className="subtotal"><td>{t('rp.totalPayments')}</td><td className="num">{money(data.totals.payments)}</td></tr>

                <tr className="head"><th colSpan="2">{t('rp.cf')}</th></tr>
                {data.accounts.map((a) => (
                  <tr key={`cf-${a.id}`}><td className="indent">{a.name}</td><td className="num">{money(a.closing)}</td></tr>
                ))}
                <tr className="total"><td>{t('rp.totalCf')}</td><td className="num">{money(data.totals.closing)}</td></tr>
              </tbody>
            </table>
            {Number(data.transfers.amount) > 0 && (
              <p className="paper-muted small">{t('rp.transfers', { amount: money(data.transfers.amount) })}</p>
            )}
            <p className="paper-muted small">{t('rp.check')}</p>
            {!data.totals.balanced && <div className="form-error" role="alert">{t('rp.unbalanced')}</div>}
          </article>

          <div className="stack no-print">
            <button type="button" className="btn btn-primary btn-block" onClick={() => window.print()}>
              <Icon name="print" size={18} /> {t('rp.print')}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={downloadCsv}>{t('rp.csv')}</button>
          </div>
        </>
      )}
    </main>
  );
}
