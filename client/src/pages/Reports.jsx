import { Link } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { Icon, TopBar } from '../components.jsx';
import { useSession } from '../session.jsx';

const STATEMENTS = [
  ['/reports/profit-loss', 'st.pl.title', 'st.pl.what'],
  ['/records/receipts-payments', 'rp.title', 'st.rp.what'],
  ['/reports/balance-sheet', 'st.bs.title', 'st.bs.what'],
  ['/reports/stock', 'st.stock.title', 'st.stock.what'],
  ['/reports/debtors', 'st.debtors.title', 'st.debtors.what'],
  ['/reports/sales-by-product', 'st.sales.title', 'st.sales.what'],
  ['/tax', 'st.tax.title', 'st.tax.what'],
];

export default function Reports() {
  const { t } = useT();
  const { business } = useSession();
  return (
    <main className="screen">
      <TopBar title={t('st.title')} back="/records" />
      <p className="muted small">{t('st.lead')}</p>
      <ul className="txn-list">
        {STATEMENTS.map(([to, title, what]) => (
          <li key={to}>
            <Link to={to} className="txn report-link">
              <span className="txn-main">
                <span className="txn-title wrap">{t(title)}</span>
                <span className="small muted">{t(what)}</span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          </li>
        ))}
      </ul>
      <h2 className="date-head">Plan and grow</h2>
      <ul className="txn-list">
        {[['/plan', 'Target & budget', 'A sales target and a spending limit for the month, with progress on Home.'],
          ['/goals', 'Savings goals', 'Save up for something, like a photocopier or next year’s rent.'],
          ['/price-check', 'Price checker', 'Profit, margin and markup on an item, and how many to sell.']].map(([to, title, what]) => (
          <li key={to}>
            <Link to={to} className="txn report-link">
              <span className="txn-main">
                <span className="txn-title wrap">{title}</span>
                <span className="small muted">{what}</span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          </li>
        ))}
      </ul>
      <h2 className="date-head">{t('st.records')}</h2>
      <ul className="txn-list">
        <li>
          <Link to="/loans" className="txn report-link">
            <span className="txn-main">
              <span className="txn-title wrap">{t('loans.title')}</span>
              <span className="small muted">{t('st.loans.what')}</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
        <li>
          <Link to="/close-day" className="txn report-link">
            <span className="txn-main">
              <span className="txn-title wrap">Close the day</span>
              <span className="small muted">Count the cash box and check the MoMo balance against the records.</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
        {['owner', 'manager'].includes(business.role) && (
          <li>
            <Link to="/activity" className="txn report-link">
              <span className="txn-main">
                <span className="txn-title wrap">Who recorded what</span>
                <span className="small muted">Records by each person, anything deleted, and cash count differences.</span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          </li>
        )}
        <li>
          <Link to="/customers" className="txn report-link">
            <span className="txn-main">
              <span className="txn-title wrap">Customers who owe</span>
              <span className="small muted">Sales paid later and unpaid invoices, customer by customer.</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
        <li>
          <Link to="/registrations" className="txn report-link">
            <span className="txn-main">
              <span className="txn-title wrap">Registrations: bank account &amp; VAT</span>
              <span className="small muted">Get ready to open a bank account or register for VAT, step by step.</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
      </ul>
    </main>
  );
}
