import { BrowserRouter, Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { AuthorList } from './pages/authors/AuthorList';
import { AuthorDetail } from './pages/authors/AuthorDetail';
import { AuthorForm } from './pages/authors/AuthorForm';
import { TitleList } from './pages/titles/TitleList';
import { TitleDetail } from './pages/titles/TitleDetail';
import { TitleForm } from './pages/titles/TitleForm';
import { PartnerList } from './pages/partners/PartnerList';
import { PartnerDetail } from './pages/partners/PartnerDetail';
import { PartnerForm } from './pages/partners/PartnerForm';
import { InventoryDashboard } from './pages/inventory/InventoryDashboard';
import { StockAdjustment } from './pages/inventory/StockAdjustment';
import { MovementHistory } from './pages/inventory/MovementHistory';
import { InvoiceList } from './pages/finance/InvoiceList';
import { InvoiceCreate } from './pages/finance/InvoiceCreate';
import { InvoiceDetail } from './pages/finance/InvoiceDetail';
import { PaymentList } from './pages/finance/PaymentList';
import { PaymentCreate } from './pages/finance/PaymentCreate';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />

          {/* Authors */}
          <Route path="authors" element={<AuthorList />} />
          <Route path="authors/new" element={<AuthorForm />} />
          <Route path="authors/:id" element={<AuthorDetail />} />
          <Route path="authors/:id/edit" element={<AuthorForm />} />

          {/* Titles */}
          <Route path="titles" element={<TitleList />} />
          <Route path="titles/new" element={<TitleForm />} />
          <Route path="titles/:id" element={<TitleDetail />} />
          <Route path="titles/:id/edit" element={<TitleForm />} />

          {/* Channel Partners */}
          <Route path="partners" element={<PartnerList />} />
          <Route path="partners/new" element={<PartnerForm />} />
          <Route path="partners/:id" element={<PartnerDetail />} />
          <Route path="partners/:id/edit" element={<PartnerForm />} />

          {/* Inventory */}
          <Route path="inventory" element={<InventoryDashboard />} />
          <Route path="inventory/receive" element={<StockAdjustment mode="receive" />} />
          <Route path="inventory/adjust" element={<StockAdjustment mode="adjust" />} />
          <Route path="inventory/:titleId/movements" element={<MovementHistory />} />

          {/* Invoices */}
          <Route path="invoices" element={<InvoiceList />} />
          <Route path="invoices/new" element={<InvoiceCreate />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />

          {/* Payments */}
          <Route path="payments" element={<PaymentList />} />
          <Route path="payments/new" element={<PaymentCreate />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
