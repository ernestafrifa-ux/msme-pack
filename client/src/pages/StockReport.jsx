import { useState } from 'react';
import { useT } from '../i18n.jsx';
import { TopBar } from '../components.jsx';
import { money, longDate, todayGhana } from '../format';
import { useReport } from '../useReport';
import { monthRange, PeriodPicker, StatementHead, StatementActions, downloadCsv } from '../statements.jsx';

export default function StockReport() {
  const { t } = useT();
  const [range, setRange] = useState(() => monthRange(todayGhana()));
  const { data: s, error } = useReport('stock', range);
  const period = s && t('rp.period', { from: longDate(s.from, t), to: longDate(s.to, t) });

  function csv() {
    downloadCsv(`stock-report-${s.from}-to-${s.to}.csv`, [
      [t('st.stock.statement')], [s.business?.name], [period], [],
      [t('st.stock.product'), t('st.stock.start'), t('st.stock.in'), t('st.stock.sold'), t('st.stock.used'), t('st.stock.lost'),
        t('st.stock.counted'), t('st.stock.end'), t('st.stock.cost'), t('st.stock.value')],
      ...s.items.map((i) => [i.name, i.opening, i.stockIn, i.sold, i.used, i.lost, i.counted, i.closing, i.costPrice, i.value]),
      [t('st.stock.total'), '', '', '', '', '', '', '', '', s.totals.value],
    ]);
  }

  return (
    <main className="screen">
      <div className="no-print"><TopBar title={t('st.stock.title')} back="/reports" /></div>
      <PeriodPicker range={range} onChange={setRange} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {s && (
        <>
          <article className="paper statement" aria-label={t('st.stock.statement')}>
            <StatementHead business={s.business} title={t('st.stock.statement')} sub={period} />
            {!s.items.length && <p className="paper-muted">{t('st.stock.none')}</p>}
            <ul className="stock-lines">
              {s.items.map((i) => (
                <li key={i.id}>
                  <div className="stock-line-top">
                    <span className="stock-name">{i.name}
                      {i.low && <span className="tag tag-warn">{t('st.stock.low')}</span>}
                      {i.slow && <span className="tag">{t('st.stock.slow')}</span>}
                      {i.kind === 'supply' && <span className="tag">{t('st.stock.supply')}</span>}
                    </span>
                    <span className="num">{money(i.value)}</span>
                  </div>
                  <div className="paper-muted small">
                    {t('st.stock.flow', { start: i.opening, in: i.stockIn, sold: i.sold, lost: i.lost, end: i.closing, unit: i.unit })}
                    {Number(i.used) !== 0 && ` · ${t('st.stock.usedN', { n: i.used })}`}
                    {Number(i.counted) !== 0 && ` · ${t('st.stock.countedN', { n: i.counted })}`}
                    {` · ${t('st.stock.at', { cost: money(i.costPrice) })}`}
                  </div>
                </li>
              ))}
            </ul>
            <table className="statement-table"><tbody>
              <tr className="total"><td>{t('st.stock.total')}</td><td className="num">{money(s.totals.value)}</td></tr>
            </tbody></table>
            <p className="paper-muted small">{t('st.stock.note')}</p>
          </article>
          <StatementActions onCsv={csv} />
        </>
      )}
    </main>
  );
}
