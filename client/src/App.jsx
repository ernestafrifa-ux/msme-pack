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
import BusinessDetails from './pages/BusinessDetails.jsx';

export default function App() {
  const { loading, user, business, connectError, retry } = useSession();
  const location = useLocation();

  // The customer's invoice link works for anyone, logged in or not.
  if (location.pathname.startsWith('/i/')) {
    return (
      <Routes>
        <Route path="/i/:token" element={<PublicInvoice />} />
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

  if (!business) {
    return (
      <Routes>
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
