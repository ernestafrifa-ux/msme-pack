import { Link } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { Icon, TopBar } from '../components.jsx';

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
