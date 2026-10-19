import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './session.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Setup from './pages/Setup.jsx';
import Home from './pages/Home.jsx';
import Record from './pages/Record.jsx';
import Records from './pages/Records.jsx';
import Stock from './pages/Stock.jsx';
import ProductForm from './pages/ProductForm.jsx';
import Product from './pages/Product.jsx';
import StockCount from './pages/StockCount.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceForm from './pages/InvoiceForm.jsx';
import Invoice from './pages/Invoice.jsx';
import PublicInvoice from './pages/PublicInvoice.jsx';
import PublicReceipt from './pages/PublicReceipt.jsx';
import Receipt from './pages/Receipt.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import CloseDay from './pages/CloseDay.jsx';
import Activity from './pages/Activity.jsx';
import BusinessDetails from './pages/BusinessDetails.jsx';
import Health from './pages/Health.jsx';
import HealthCheck from './pages/HealthCheck.jsx';
import Learn from './pages/Learn.jsx';
import Guide from './pages/Guide.jsx';
import ReceiptsPayments from './pages/ReceiptsPayments.jsx';
import Reports from './pages/Reports.jsx';
import ProfitLoss from './pages/ProfitLoss.jsx';
import BalanceSheet from './pages/BalanceSheet.jsx';
import StockReport from './pages/StockReport.jsx';
import Debtors from './pages/Debtors.jsx';
import SalesByProduct from './pages/SalesByProduct.jsx';
import Loans from './pages/Loans.jsx';
import LoanDetail from './pages/LoanDetail.jsx';
import Tax from './pages/Tax.jsx';
import Registrations from './pages/Registrations.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import NoBusiness from './pages/NoBusiness.jsx';
import Admin from './pages/Admin.jsx';
import AdminNewBusiness from './pages/AdminNewBusiness.jsx';
import AdminNotices from './pages/AdminNotices.jsx';
import Notices from './pages/Notices.jsx';

export default function App() {
  const { loading, user, business, connectError, retry } = useSession();
  const location = useLocation();

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
