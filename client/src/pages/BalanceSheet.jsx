import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { TopBar } from '../components.jsx';
import { money, longDate, todayGhana } from '../format';
import { useReport } from '../useReport';
import { AsOfPicker, StatementHead, StatementActions, downloadCsv, Head, Row, Subtotal, Total } from '../statements.jsx';

export default function BalanceSheet() {
  const { t } = useT();
  const [asOf, setAsOf] = useState(todayGhana());
  const { data: s, error } = useReport('balance-sheet', { asOf });
  const sub = s && t('st.bs.asAt', { date: longDate(s.asOf, t) });

  function csv() {
    downloadCsv(`balance-sheet-${s.asOf}.csv`, [
      [t('st.bs.statement')], [s.business?.name], [sub], [],
      [t('st.bs.owns')],
      ...s.assets.cash.map((c) => [`  ${c.name}`, c.amount]),
      [`  ${t('st.bs.stock')}`, s.assets.stock], [`  ${t('st.bs.debtors')}`, s.assets.debtors],
      ...s.assets.equipment.map((e) => [`  ${e.name}`, e.amount]),
      ...(Number(s.assets.whtCredit) > 0 ? [[`  ${t('st.bs.whtCredit')}`, s.assets.whtCredit]] : []),
      ...(Number(s.assets.vatCredit) > 0 ? [[`  ${t('st.bs.vatCredit')}`, s.assets.vatCredit]] : []),
      [t('st.bs.totalOwns'), s.assets.total], [],
      [t('st.bs.owes')], ...s.liabilities.debts.map((d) => [`  ${d.name}`, d.amount]),
      ...(Number(s.liabilities.taxOwed) !== 0 ? [[`  ${t('st.bs.taxOwed')}`, s.liabilities.taxOwed]] : []),
      [t('st.bs.totalOwes'), s.liabilities.total], [],
      [t('st.bs.equity'), s.equity],
    ]);
  }

  return (
    <main className="screen">
      <div className="no-print"><TopBar title={t('st.bs.title')} back="/reports" /></div>
      <AsOfPicker value={asOf} onChange={setAsOf} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {s && (
        <>
          <article className="paper statement" aria-label={t('st.bs.statement')}>
            <StatementHead business={s.business} title={t('st.bs.statement')} sub={sub} />
            <table className="statement-table"><tbody>
              <Head>{t('st.bs.owns')}</Head>
              {s.assets.cash.map((c) => <Row key={c.name} label={c.name} amount={money(c.amount)} />)}
              <Row label={t('st.bs.stock')} amount={money(s.assets.stock)} />
              <Row label={t('st.bs.debtors')} amount={money(s.assets.debtors)} />
              {s.assets.equipment.map((e) => <Row key={e.name} label={e.name} amount={money(e.amount)} />)}
              {Number(s.assets.whtCredit) > 0 && <Row label={t('st.bs.whtCredit')} amount={money(s.assets.whtCredit)} />}
              {Number(s.assets.vatCredit) > 0 && <Row label={t('st.bs.vatCredit')} amount={money(s.assets.vatCredit)} />}
              <Subtotal label={t('st.bs.totalOwns')} amount={money(s.assets.total)} />
              <Head>{t('st.bs.owes')}</Head>
              {s.liabilities.debts.map((d) => <Row key={d.name + d.kind} label={`${d.name} (${t(`loans.short.${d.kind}`)})`} amount={money(d.amount)} />)}
              {Number(s.liabilities.taxOwed) !== 0 && <Row label={t('st.bs.taxOwed')} amount={money(s.liabilities.taxOwed)} />}
              {!s.liabilities.debts.length && Number(s.liabilities.taxOwed) === 0 && <Row label={t('rp.none')} amount="0.00" muted />}
              <Subtotal label={t('st.bs.totalOwes')} amount={money(s.liabilities.total)} />
              <Total label={t('st.bs.equity')} amount={money(s.equity)} />
            </tbody></table>
            <p className="paper-muted small">{t('st.bs.note')}</p>
          </article>
          <p className="muted small no-print">{t('st.bs.missing')} <Link to="/loans">{t('loans.title')}</Link></p>
          <StatementActions onCsv={csv} />
        </>
      )}
    </main>
  );
}
