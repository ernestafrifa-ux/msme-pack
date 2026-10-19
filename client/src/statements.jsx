// Shared pieces for the financial statements: choosing the period, the printable
// page header, and the print / spreadsheet buttons.
import { useState } from 'react';
import { useT } from './i18n.jsx';
import { Icon } from './components.jsx';
import { longDate, todayGhana, addDaysIso } from './format';

// First and last day of the month containing `iso`, the last capped at today.
export function monthRange(iso) {
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

// Month stepper, or two dates when "Choose dates" is on.
export function PeriodPicker({ range, onChange }) {
  const { t } = useT();
  const [custom, setCustom] = useState(false);
  const isCurrentMonth = range.from === monthRange(todayGhana()).from;
  return (
    <div className="no-print">
      {!custom ? (
        <div className="month-step">
          <button type="button" className="icon-btn" aria-label={t('rp.prev')}
            onClick={() => onChange(shiftMonth(range.from, -1))}><Icon name="back" /></button>
          <span className="month-step-label">{t('rp.period', { from: longDate(range.from, t), to: longDate(range.to, t) })}</span>
          <button type="button" className="icon-btn" aria-label={t('rp.next')} disabled={isCurrentMonth}
            onClick={() => onChange(shiftMonth(range.from, 1))}><Icon name="chevron" /></button>
        </div>
      ) : (
        <div className="grid-2">
          <label className="field"><span className="field-label">{t('rp.from')}</span>
            <input type="date" value={range.from} max={range.to} onChange={(e) => onChange({ ...range, from: e.target.value })} /></label>
          <label className="field"><span className="field-label">{t('rp.to')}</span>
            <input type="date" value={range.to} min={range.from} onChange={(e) => onChange({ ...range, to: e.target.value })} /></label>
        </div>
      )}
      <button type="button" className="btn-link small" onClick={() => {
        if (custom) onChange(monthRange(todayGhana()));
        setCustom(!custom);
      }}>{custom ? t('rp.byMonth') : t('rp.choose')}</button>
    </div>
  );
}

// A single "as at" date (balance sheet, debtors).
export function AsOfPicker({ value, onChange }) {
  const { t } = useT();
  return (
    <div className="no-print">
      <label className="field"><span className="field-label">{t('st.asOf')}</span>
        <input type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} /></label>
    </div>
  );
}

export function StatementHead({ business, title, sub }) {
  return (
    <div className="statement-head">
      {business?.logoUrl && <img className="statement-logo" src={business.logoUrl} alt="" />}
      <div className="statement-biz">{business?.name}</div>
      <h1>{title}</h1>
      <div className="paper-muted">{sub}</div>
    </div>
  );
}

// rows: arrays of cells. Excel opens UTF-8 CSV correctly with the BOM.
export function downloadCsv(filename, rows) {
  const text = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StatementActions({ onCsv }) {
  const { t } = useT();
  return (
    <div className="stack no-print">
      <button type="button" className="btn btn-primary btn-block" onClick={() => window.print()}>
        <Icon name="print" size={18} /> {t('rp.print')}
      </button>
      {onCsv && <button type="button" className="btn btn-ghost btn-block" onClick={onCsv}>{t('rp.csv')}</button>}
    </div>
  );
}

// Two-column statement rows.
export const Head = ({ children }) => <tr className="head"><th colSpan="2">{children}</th></tr>;
export const Row = ({ label, amount, indent = true, muted }) => (
  <tr className={muted ? 'muted' : undefined}><td className={indent ? 'indent' : undefined}>{label}</td><td className="num">{amount}</td></tr>
);
export const Subtotal = ({ label, amount }) => <tr className="subtotal"><td>{label}</td><td className="num">{amount}</td></tr>;
export const Total = ({ label, amount }) => <tr className="total"><td>{label}</td><td className="num">{amount}</td></tr>;
