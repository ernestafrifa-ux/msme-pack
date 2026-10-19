import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { TopBar } from '../components.jsx';
import { money, longDate, monthName } from '../format';
import { StatementActions, downloadCsv } from '../statements.jsx';

const LEGAL = { unregistered: 'Not registered', sole_proprietorship: 'Sole proprietorship', partnership: 'Partnership',
  company_ltd_shares: 'Limited company', company_ltd_guarantee: 'Company limited by guarantee', cooperative: 'Cooperative' };
const KIND = { bank: 'Bank', microfinance: 'Microfinance', susu: 'Susu', supplier: 'Supplier', family: 'Family or friend', other: 'Other' };

function Tile({ label, value, note }) {
  return <div className="pack-tile"><div className="paper-muted small">{label}</div><div className="pack-tile-val">{value}</div>{note && <div className="paper-muted small">{note}</div>}</div>;
}

// A printable summary for a lender or support programme, built from the records.
export default function LoanPack() {
  const { business } = useSession();
  const { t } = useT();
  const [months, setMonths] = useState(6);
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setP(null);
    api(`/businesses/${business.id}/reports/loan-pack?months=${months}`).then(setP).catch((err) => setError(err.message));
  }, [business.id, months]);
  const mName = (m) => `${monthName(m, t).slice(0, 3)} ${m.slice(2, 4)}`;
  const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

  function csv() {
    downloadCsv(`business-summary-${p.generatedOn}.csv`, [
      [`${p.business.name}: business summary`], [`${p.from} to ${p.to}`], [],
      ['Month', 'Sales', 'Gross profit', 'Expenses', 'Net profit', 'Owner pay', 'Money in', 'Money out', 'Cash at month end', 'Days recorded'],
      ...p.months.map((m) => [m.month, m.sales, m.grossProfit, m.expenses, m.netProfit, m.ownerPay, m.cashIn, m.cashOut, m.closingCash, m.daysRecorded]),
      ['Total', p.totals.sales, p.totals.grossProfit, p.totals.expenses, p.totals.netProfit, p.totals.ownerPay, p.totals.cashIn, p.totals.cashOut],
    ]);
  }

  return (
    <main className="screen">
      <div className="no-print">
        <TopBar title="Loan-ready pack" back="/reports" />
        <p className="lead">A summary of your business for a bank, microfinance or support programme. Print it or save it as a PDF and take it with you.</p>
        <div className="segmented" role="group" aria-label="Period">
          {[3, 6, 12].map((m) => <button key={m} type="button" aria-pressed={months === m} onClick={() => setMonths(m)}>{m} months</button>)}
        </div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {!p && !error && <p className="muted">Preparing…</p>}
      {p && (
        <>
          <article className="paper pack" aria-label="Business summary">
            <header className="pack-head">
              {p.business.logoUrl && <img className="paper-logo" src={p.business.logoUrl} alt="" />}
              <div>
                <div className="paper-biz">{p.business.name}</div>
                <div className="paper-label">BUSINESS SUMMARY</div>
                <div className="paper-muted">{longDate(p.from, t)} to {longDate(p.to, t)} · prepared {longDate(p.generatedOn, t)}</div>
              </div>
            </header>

            <h2 className="pack-h">The business</h2>
            <table className="statement-table"><tbody>
              <tr><td>Owner</td><td className="num">{p.business.owners.map((o) => o.name).join(', ')}</td></tr>
              <tr><td>What it does</td><td className="num">{p.business.sector || '—'}</td></tr>
              <tr><td>Where</td><td className="num">{[p.business.town, p.business.region].filter(Boolean).join(', ') || '—'}{p.business.digitalAddress ? ` · ${p.business.digitalAddress}` : ''}</td></tr>
              <tr><td>Registration</td><td className="num">{LEGAL[p.business.legalForm] || p.business.legalForm}</td></tr>
              {p.business.tin && <tr><td>TIN</td><td className="num">{p.business.tin}</td></tr>}
              {p.business.vatNumber && <tr><td>VAT number</td><td className="num">{p.business.vatNumber}</td></tr>}
              <tr><td>Phone</td><td className="num">{(p.business.phone || p.business.owners[0]?.phone || '').replace('+233', '0')}</td></tr>
              <tr><td>Keeping records since</td><td className="num">{p.business.recordsSince ? longDate(p.business.recordsSince, t) : '—'}</td></tr>
              <tr><td>People using the records</td><td className="num">{p.business.people}</td></tr>
            </tbody></table>

            {p.months.length < p.requestedMonths && (
              <p className="paper-muted small">The business has kept records here for {p.months.length} month{p.months.length === 1 ? '' : 's'}, so the summary covers {p.months.length === 1 ? 'that month' : 'those months'}.</p>
            )}
            <h2 className="pack-h">Key figures</h2>
            <div className="pack-tiles">
              <Tile label="Average sales a month" value={`GHS ${money(p.averages.sales)}`} />
              <Tile label="Average profit a month" value={`GHS ${money(p.averages.netProfit)}`} note={`net margin ${pct(p.averages.netMargin)}`} />
              <Tile label="Sales growth" value={pct(p.averages.salesGrowth)} note="later half of the period vs earlier half" />
              <Tile label="Cash and bank now" value={`GHS ${money(p.balanceSheet.assets.cashTotal)}`} />
              <Tile label="Owes (loans, suppliers, tax)" value={`GHS ${money(p.balanceSheet.liabilities.total)}`} />
              <Tile label="Owner’s share" value={`GHS ${money(p.balanceSheet.equity)}`} note="what it owns − what it owes" />
            </div>

            <h2 className="pack-h">Month by month</h2>
            <div className="table-scroll">
              <table className="pack-table">
                <thead><tr><th>Month</th><th className="num">Sales</th><th className="num">Gross profit</th><th className="num">Expenses</th><th className="num">Net profit</th><th className="num">Owner pay</th><th className="num">Cash at end</th></tr></thead>
                <tbody>
                  {p.months.map((m) => (
                    <tr key={m.month}><td>{mName(m.month)}</td><td className="num">{money(m.sales)}</td><td className="num">{money(m.grossProfit)}</td><td className="num">{money(m.expenses)}</td>
                      <td className={'num' + (Number(m.netProfit) < 0 ? ' neg' : '')}>{money(m.netProfit)}</td><td className="num">{money(m.ownerPay)}</td><td className="num">{money(m.closingCash)}</td></tr>
                  ))}
                  <tr className="total"><td>Total</td><td className="num">{money(p.totals.sales)}</td><td className="num">{money(p.totals.grossProfit)}</td><td className="num">{money(p.totals.expenses)}</td><td className="num">{money(p.totals.netProfit)}</td><td className="num">{money(p.totals.ownerPay)}</td><td /></tr>
                </tbody>
              </table>
            </div>
            <p className="paper-muted small">Gross margin {pct(p.averages.grossMargin)}. Sales count when the money is received. Expenses include MoMo charges and damaged or missing stock.</p>

            <h2 className="pack-h">Money in and out</h2>
            <div className="table-scroll">
              <table className="pack-table">
                <thead><tr><th>Month</th><th className="num">Money in</th><th className="num">Money out</th><th className="num">Difference</th></tr></thead>
                <tbody>
                  {p.months.map((m) => (
                    <tr key={m.month}><td>{mName(m.month)}</td><td className="num">{money(m.cashIn)}</td><td className="num">{money(m.cashOut)}</td><td className="num">{money(Number(m.cashIn) - Number(m.cashOut))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="pack-h">What the business owns and owes today</h2>
            <table className="statement-table"><tbody>
              <tr><td>Cash, MoMo and bank</td><td className="num">{money(p.balanceSheet.assets.cashTotal)}</td></tr>
              <tr><td>Stock (at cost)</td><td className="num">{money(p.balanceSheet.assets.stock)}</td></tr>
              <tr><td>Customers owe</td><td className="num">{money(p.balanceSheet.assets.debtors)}</td></tr>
              <tr><td>Equipment</td><td className="num">{money(p.balanceSheet.assets.equipmentTotal)}</td></tr>
              <tr className="subtotal"><td>Total owned</td><td className="num">{money(p.balanceSheet.assets.total)}</td></tr>
              <tr className="subtotal"><td>Total owed</td><td className="num">{money(p.balanceSheet.liabilities.total)}</td></tr>
              <tr className="total"><td>Owner’s share</td><td className="num">{money(p.balanceSheet.equity)}</td></tr>
            </tbody></table>

            <h2 className="pack-h">Loans and credit</h2>
            {p.debts.length ? (
              <table className="statement-table"><tbody>
                {p.debts.map((d, i) => <tr key={i}><td>{d.lender} <span className="paper-muted">({KIND[d.kind] || d.kind}, since {longDate(d.since, t)})</span></td><td className="num">{money(d.balance)} of {money(d.borrowed)}</td></tr>)}
              </tbody></table>
            ) : <p className="small">No loans or supplier credit outstanding.</p>}
            {p.repayments.count > 0 && <p className="small">{p.repayments.count} loan repayments made in the period, GHS {money(p.repayments.total)} in all.</p>}

            <h2 className="pack-h">Record keeping</h2>
            <p className="small">Records kept on <strong>{p.recordKeeping.daysRecorded} days</strong>, in {p.recordKeeping.monthsWithRecords} of the {p.recordKeeping.months} months ({p.recordKeeping.records} records).
              {p.health ? ` Business health check score: ${p.health.score} out of 100 (${longDate(p.health.on.slice(0, 10), t)}).` : ''}</p>

            <div className="pack-sign">
              <p className="paper-muted small">These figures come from the owner&rsquo;s own records kept in MSME Pack. They have not been audited.</p>
              <div className="pack-sign-lines">
                <div><div className="sign-line" />Owner&rsquo;s signature</div>
                <div><div className="sign-line" />Date</div>
              </div>
            </div>
          </article>
          <StatementActions onCsv={csv} />
        </>
      )}
    </main>
  );
}
