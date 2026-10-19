import { useState } from 'react';
import { useT } from '../i18n.jsx';
import { TopBar } from '../components.jsx';
import { money, longDate, todayGhana } from '../format';
import { useReport } from '../useReport';
import { monthRange, PeriodPicker, StatementHead, StatementActions, downloadCsv, Head, Row, Subtotal, Total } from '../statements.jsx';

// Money out shows in brackets, the way statements are printed.
const signed = (n) => (Number(n) < 0 ? `(${money(-Number(n))})` : money(n));

function Section({ title, rows, net, netLabel, t }) {
  return (
    <>
      <Head>{title}</Head>
      {rows.length
        ? rows.map((r) => <Row key={r.line} label={t(`st.cf.line.${r.line}`)} amount={signed(r.amount)} />)
        : <Row label={t('rp.none')} amount="0.00" muted />}
      <Subtotal label={netLabel} amount={signed(net)} />
    </>
  );
}

export default function CashFlow() {
  const { t } = useT();
  const [range, setRange] = useState(() => monthRange(todayGhana()));
  const { data: s, error } = useReport('cash-flow', range);
  const period = s && t('rp.period', { from: longDate(s.from, t), to: longDate(s.to, t) });
  const changeLabel = s && Number(s.totals.change) < 0 ? t('st.cf.decrease') : t('st.cf.increase');

  function csv() {
    const sec = (title, rows, netLabel, net) => [[title], ...rows.map((r) => [`  ${t(`st.cf.line.${r.line}`)}`, r.amount]), [netLabel, net], []];
    downloadCsv(`cash-flow-${s.from}-to-${s.to}.csv`, [
      [t('st.cf.statement')], [s.business?.name], [period], [],
      ...sec(t('st.cf.operating'), s.operating, t('st.cf.netOperating'), s.totals.operating),
      ...sec(t('st.cf.investing'), s.investing, t('st.cf.netInvesting'), s.totals.investing),
      ...sec(t('st.cf.financing'), s.financing, t('st.cf.netFinancing'), s.totals.financing),
      [changeLabel, s.totals.change],
      [t('st.cf.opening'), s.totals.opening],
      [t('st.cf.closing'), s.totals.closing],
    ]);
  }

  return (
    <main className="screen">
      <div className="no-print"><TopBar title={t('st.cf.title')} back="/reports" /></div>
      <PeriodPicker range={range} onChange={setRange} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {s && (
        <>
          <article className="paper statement" aria-label={t('st.cf.statement')}>
            <StatementHead business={s.business} title={t('st.cf.statement')} sub={period} />
            <table className="statement-table"><tbody>
              <Section title={t('st.cf.operating')} rows={s.operating} net={s.totals.operating} netLabel={t('st.cf.netOperating')} t={t} />
              <Section title={t('st.cf.investing')} rows={s.investing} net={s.totals.investing} netLabel={t('st.cf.netInvesting')} t={t} />
              <Section title={t('st.cf.financing')} rows={s.financing} net={s.totals.financing} netLabel={t('st.cf.netFinancing')} t={t} />
              <Subtotal label={changeLabel} amount={signed(s.totals.change)} />
              <Row label={t('st.cf.opening')} amount={money(s.totals.opening)} indent={false} />
              <Total label={t('st.cf.closing')} amount={money(s.totals.closing)} />
            </tbody></table>
            <p className="paper-muted small">{t('st.cf.note')}</p>
            <p className="paper-muted small">{t('st.cf.profitNote')}</p>
            {!s.totals.balanced && <div className="form-error" role="alert">{t('rp.unbalanced')}</div>}
          </article>
          <StatementActions onCsv={csv} />
        </>
      )}
    </main>
  );
}
