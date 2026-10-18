import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { TopBar } from '../components.jsx';
import { money, longDate, todayGhana } from '../format';
import { useReport } from '../useReport';
import { AsOfPicker, StatementHead, StatementActions, downloadCsv } from '../statements.jsx';

const BUCKETS = ['notDue', 'd1_30', 'd31_60', 'd61'];

export default function Debtors() {
  const { t } = useT();
  const [asOf, setAsOf] = useState(todayGhana());
  const { data: s, error } = useReport('debtors', { asOf });
  const sub = s && t('st.bs.asAt', { date: longDate(s.asOf, t) });

  function csv() {
    downloadCsv(`who-owes-you-${s.asOf}.csv`, [
      [t('st.debtors.statement')], [s.business?.name], [sub], [],
      [t('st.debtors.customer'), t('st.debtors.invoice'), t('st.debtors.due'), t('st.debtors.owed'), t('st.debtors.age')],
      ...s.customers.flatMap((c) => c.invoices.map((i) => [c.customer, i.number, i.dueDate || '', i.outstanding, t(`st.debtors.b.${i.bucket}`)])),
      [], ...BUCKETS.map((b) => [t(`st.debtors.b.${b}`), '', '', s.totals[b]]), [t('st.debtors.total'), '', '', s.totals.total],
    ]);
  }

  return (
    <main className="screen">
      <div className="no-print"><TopBar title={t('st.debtors.title')} back="/reports" /></div>
      <AsOfPicker value={asOf} onChange={setAsOf} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {s && (
        <>
          <article className="paper statement" aria-label={t('st.debtors.statement')}>
            <StatementHead business={s.business} title={t('st.debtors.statement')} sub={sub} />
            <div className="age-grid">
              {BUCKETS.map((b) => (
                <div key={b} className={`age-cell${b !== 'notDue' && Number(s.totals[b]) > 0 ? ' late' : ''}`}>
                  <div className="paper-muted small">{t(`st.debtors.b.${b}`)}</div>
                  <div className="num">{money(s.totals[b])}</div>
                </div>
              ))}
            </div>
            {!s.customers.length && <p className="paper-muted">{t('st.debtors.none')}</p>}
            {s.customers.map((c) => (
              <section key={c.customer || '-'} className="debtor">
                <div className="stock-line-top"><span className="stock-name">{c.customer || t('st.debtors.noName')}</span>
                  <span className="num">{money(c.total)}</span></div>
                {c.invoices.map((i) => (
                  <div key={i.id} className="paper-muted small debtor-inv">
                    <Link to={`/invoices/${i.id}`} className="no-print-link">{i.number}</Link>
                    {' · '}{money(i.outstanding)}{' · '}
                    {i.bucket === 'notDue'
                      ? (i.dueDate ? t('st.debtors.dueOn', { date: longDate(i.dueDate, t) }) : t('st.debtors.noDue'))
                      : t('st.debtors.late', { n: i.daysOverdue })}
                  </div>
                ))}
              </section>
            ))}
            <table className="statement-table"><tbody>
              <tr className="total"><td>{t('st.debtors.total')}</td><td className="num">{money(s.totals.total)}</td></tr>
            </tbody></table>
          </article>
          <StatementActions onCsv={csv} />
        </>
      )}
    </main>
  );
}
