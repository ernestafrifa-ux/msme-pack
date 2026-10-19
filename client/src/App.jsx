import { lazy, useEffect } from 'react';
import { flushOutbox } from './api';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './session.jsx';
import Login from './pages/Login.jsx';
const Signup = lazy(() => import('./pages/Signup.jsx'));
import Setup from './pages/Setup.jsx';
import Home from './pages/Home.jsx';
import Record from './pages/Record.jsx';
import Records from './pages/Records.jsx';
const Stock = lazy(() => import('./pages/Stock.jsx'));
const ProductForm = lazy(() => import('./pages/ProductForm.jsx'));
const Product = lazy(() => import('./pages/Product.jsx'));
const StockCount = lazy(() => import('./pages/StockCount.jsx'));
const Invoices = lazy(() => import('./pages/Invoices.jsx'));
const InvoiceForm = lazy(() => import('./pages/InvoiceForm.jsx'));
const Invoice = lazy(() => import('./pages/Invoice.jsx'));
const PublicInvoice = lazy(() => import('./pages/PublicInvoice.jsx'));
const PublicReceipt = lazy(() => import('./pages/PublicReceipt.jsx'));
const Receipt = lazy(() => import('./pages/Receipt.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail.jsx'));
const CloseDay = lazy(() => import('./pages/CloseDay.jsx'));
const Activity = lazy(() => import('./pages/Activity.jsx'));
const Plan = lazy(() => import('./pages/Plan.jsx'));
const Goals = lazy(() => import('./pages/Goals.jsx'));
const PriceCheck = lazy(() => import('./pages/PriceCheck.jsx'));
const LoanPack = lazy(() => import('./pages/LoanPack.jsx'));
const MomoCheck = lazy(() => import('./pages/MomoCheck.jsx'));
const BusinessDetails = lazy(() => import('./pages/BusinessDetails.jsx'));
const Health = lazy(() => import('./pages/Health.jsx'));
const HealthCheck = lazy(() => import('./pages/HealthCheck.jsx'));
const Learn = lazy(() => import('./pages/Learn.jsx'));
const Guide = lazy(() => import('./pages/Guide.jsx'));
const ReceiptsPayments = lazy(() => import('./pages/ReceiptsPayments.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const ProfitLoss = lazy(() => import('./pages/ProfitLoss.jsx'));
const BalanceSheet = lazy(() => import('./pages/BalanceSheet.jsx'));
const StockReport = lazy(() => import('./pages/StockReport.jsx'));
const Debtors = lazy(() => import('./pages/Debtors.jsx'));
const SalesByProduct = lazy(() => import('./pages/SalesByProduct.jsx'));
const Loans = lazy(() => import('./pages/Loans.jsx'));
const LoanDetail = lazy(() => import('./pages/LoanDetail.jsx'));
const Tax = lazy(() => import('./pages/Tax.jsx'));
const Registrations = lazy(() => import('./pages/Registrations.jsx'));
import ChangePassword from './pages/ChangePassword.jsx';
import NoBusiness from './pages/NoBusiness.jsx';
const Admin = lazy(() => import('./pages/Admin.jsx'));
const AdminNewBusiness = lazy(() => import('./pages/AdminNewBusiness.jsx'));
const AdminNotices = lazy(() => import('./pages/AdminNotices.jsx'));
const AdminGroups = lazy(() => import('./pages/AdminGroups.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const Notices = lazy(() => import('./pages/Notices.jsx'));

export default function App() {
  const { loading, user, business, connectError, retry } = useSession();
  const location = useLocation();

  // Send records saved offline: now, when the connection returns, and every minute.
  useEffect(() => {
    if (!user) return undefined;
    flushOutbox();
    const onOnline = () => flushOutbox();
    window.addEventListener('online', onOnline);
    const timer = setInterval(flushOutbox, 60000);
    return () => { window.removeEventListener('online', onOnline); clearInterval(timer); };
  }, [user]);

  // The customer's invoice link works for anyone, logged in or not.
  if (location.pathname.startsWith('/i/') || location.pathname.startsWith('/r/')) {
    return (
      <Routes>
        <Route path="/i/:token" element={<PublicInvoice />} />
        <Route path="/r/:token" element={<PublicReceipt />} />
      </Routes>
    );
  }

  if (loading) {
    return <div className="center-screen" role="status">Loading…</div>;
  }
  if (connectError && !user) {
    return (
      <div className="center-screen">
        <p>{connectError}</p>
        <button className="btn btn-primary" onClick={retry}>Try again</button>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // A temporary password from the admin or the owner must be replaced first.
  if (user.mustChangePassword) return <ChangePassword required />;

  const adminRoutes = user.isAdmin ? [
    <Route key="a" path="/admin" element={<Admin />} />,
    <Route key="n" path="/admin/new" element={<AdminNewBusiness />} />,
    <Route key="m" path="/admin/notices" element={<AdminNotices />} />,
    <Route key="g" path="/admin/groups" element={<AdminGroups />} />,
    <Route key="d" path="/admin/dashboard" element={<AdminDashboard />} />,
  ] : [];

  if (!business) {
    if (user.isAdmin) {
      return (
        <Routes>
          {adminRoutes}
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      );
    }
    return <NoBusiness />;
  }

  // A business the admin created without balances: the owner enters them first.
  if (!business.setupDone) {
    if (business.role !== 'owner') return <NoBusiness waiting />;
    return (
      <Routes>
        {adminRoutes}
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/record/:kind" element={<Record />} />
      <Route path="/records" element={<Records />} />
      <Route path="/records/receipts-payments" element={<ReceiptsPayments />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/reports/profit-loss" element={<ProfitLoss />} />
      <Route path="/reports/balance-sheet" element={<BalanceSheet />} />
      <Route path="/reports/stock" element={<StockReport />} />
      <Route path="/reports/debtors" element={<Debtors />} />
      <Route path="/reports/sales-by-product" element={<SalesByProduct />} />
      <Route path="/tax" element={<Tax />} />
      <Route path="/registrations" element={<Registrations />} />
      <Route path="/loans" element={<Loans />} />
      <Route path="/loans/:debtId" element={<LoanDetail />} />
      <Route path="/stock" element={<Stock />} />
      <Route path="/stock/new" element={<ProductForm />} />
      <Route path="/stock/count" element={<StockCount />} />
      <Route path="/stock/:productId" element={<Product />} />
      <Route path="/stock/:productId/edit" element={<ProductForm />} />
      <Route path="/invoices" element={<Invoices />} />
      <Route path="/invoices/new" element={<InvoiceForm />} />
      <Route path="/invoices/:invoiceId" element={<Invoice />} />
      <Route path="/invoices/:invoiceId/edit" element={<InvoiceForm />} />
      <Route path="/settings" element={<BusinessDetails />} />
      <Route path="/settings/password" element={<ChangePassword />} />
      <Route path="/notices" element={<Notices />} />
      <Route path="/receipt/:id" element={<Receipt />} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/close-day" element={<CloseDay />} />
      <Route path="/activity" element={<Activity />} />
      <Route path="/plan" element={<Plan />} />
      <Route path="/goals" element={<Goals />} />
      <Route path="/price-check" element={<PriceCheck />} />
      <Route path="/loan-pack" element={<LoanPack />} />
      <Route path="/momo-check" element={<MomoCheck />} />
      <Route path="/customers/:contactId" element={<CustomerDetail />} />
      {adminRoutes}
      <Route path="/health" element={<Health />} />
      <Route path="/health/check" element={<HealthCheck />} />
      <Route path="/learn" element={<Learn />} />
      <Route path="/learn/:slug" element={<Guide />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
