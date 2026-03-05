import { BrowserRouter, Routes, Route } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { PortalLayout } from './components/PortalLayout';
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
import { RemittanceList } from './pages/finance/RemittanceList';
import { RemittanceCreate } from './pages/finance/RemittanceCreate';
import { RemittanceDetail } from './pages/finance/RemittanceDetail';
import { DebitNoteList } from './pages/finance/DebitNoteList';
import { DebitNoteCreate } from './pages/finance/DebitNoteCreate';
import { CreditNoteList } from './pages/finance/CreditNoteList';
import { QuotationList } from './pages/finance/QuotationList';
import { QuotationCreate } from './pages/finance/QuotationCreate';
import { QuotationDetail } from './pages/finance/QuotationDetail';
import { ExpenseList } from './pages/expenses/ExpenseList';
import { ExpenseCreate } from './pages/expenses/ExpenseCreate';
import { ExpenseCategoryManage } from './pages/expenses/ExpenseCategoryManage';
import { ConsignmentList } from './pages/consignments/ConsignmentList';
import { ConsignmentCreate } from './pages/consignments/ConsignmentCreate';
import { ConsignmentDetail } from './pages/consignments/ConsignmentDetail';
import { StatementGenerate } from './pages/statements/StatementGenerate';
import { CompanySettings } from './pages/settings/CompanySettings';
import { LogoManagement } from './pages/settings/LogoManagement';
import { UserProfile } from './pages/settings/UserProfile';
import { UserManagement } from './pages/settings/UserManagement';
import { InvoiceReminders } from './pages/settings/InvoiceReminders';
import { PortalDashboard } from './pages/portal/PortalDashboard';
import { PortalRoyalties } from './pages/portal/PortalRoyalties';
import { PortalContracts } from './pages/portal/PortalContracts';
import { PortalContractDetail } from './pages/portal/PortalContractDetail';
import { PortalPayments } from './pages/portal/PortalPayments';
import { ReportsDashboard } from './pages/reports/ReportsDashboard';
import { ProfitLoss } from './pages/reports/ProfitLoss';
import { SalesReport } from './pages/reports/SalesReport';
import { OverdueAging } from './pages/reports/OverdueAging';
import { InventoryReport } from './pages/reports/InventoryReport';
import { AuthorRoyaltyReport } from './pages/reports/AuthorRoyaltyReport';
import { ReturnsList } from './pages/returns/ReturnsList';
import { ReturnsCreate } from './pages/returns/ReturnsCreate';
import { ReturnsDetail } from './pages/returns/ReturnsDetail';
import { SyncDashboard } from './pages/sync/SyncDashboard';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Admin / Staff layout */}
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

          {/* Remittances */}
          <Route path="remittances" element={<RemittanceList />} />
          <Route path="remittances/new" element={<RemittanceCreate />} />
          <Route path="remittances/:id" element={<RemittanceDetail />} />

          {/* Debit Notes */}
          <Route path="debit-notes" element={<DebitNoteList />} />
          <Route path="debit-notes/new" element={<DebitNoteCreate />} />

          {/* Credit Notes */}
          <Route path="credit-notes" element={<CreditNoteList />} />

          {/* Quotations */}
          <Route path="quotations" element={<QuotationList />} />
          <Route path="quotations/new" element={<QuotationCreate />} />
          <Route path="quotations/:id" element={<QuotationDetail />} />

          {/* Expenses */}
          <Route path="expenses" element={<ExpenseList />} />
          <Route path="expenses/new" element={<ExpenseCreate />} />
          <Route path="expenses/categories" element={<ExpenseCategoryManage />} />

          {/* Consignments */}
          <Route path="consignments" element={<ConsignmentList />} />
          <Route path="consignments/new" element={<ConsignmentCreate />} />
          <Route path="consignments/:id" element={<ConsignmentDetail />} />

          {/* Returns */}
          <Route path="returns" element={<ReturnsList />} />
          <Route path="returns/new" element={<ReturnsCreate />} />
          <Route path="returns/:id" element={<ReturnsDetail />} />

          {/* Statements */}
          <Route path="statements" element={<StatementGenerate />} />

          {/* Reports */}
          <Route path="reports" element={<ReportsDashboard />} />
          <Route path="reports/profit-loss" element={<ProfitLoss />} />
          <Route path="reports/sales" element={<SalesReport />} />
          <Route path="reports/overdue-aging" element={<OverdueAging />} />
          <Route path="reports/inventory" element={<InventoryReport />} />
          <Route path="reports/author-royalty" element={<AuthorRoyaltyReport />} />

          {/* Sync */}
          <Route path="sync" element={<SyncDashboard />} />

          {/* Settings (admin) */}
          <Route path="settings" element={<CompanySettings />} />
          <Route path="settings/logo" element={<LogoManagement />} />
          <Route path="settings/profile" element={<UserProfile />} />
          <Route path="settings/users" element={<UserManagement />} />
          <Route path="settings/reminders" element={<InvoiceReminders />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* Author Portal layout */}
        <Route
          element={
            <ProtectedRoute allowedRoles={['author']}>
              <PortalLayout />
            </ProtectedRoute>
          }
        >
          <Route path="portal" element={<PortalDashboard />} />
          <Route path="portal/royalties" element={<PortalRoyalties />} />
          <Route path="portal/contracts" element={<PortalContracts />} />
          <Route path="portal/contracts/:id" element={<PortalContractDetail />} />
          <Route path="portal/payments" element={<PortalPayments />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
