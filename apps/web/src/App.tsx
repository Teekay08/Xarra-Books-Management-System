import { createBrowserRouter, RouterProvider } from 'react-router';
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
import { StockTake } from './pages/inventory/StockTake';
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
import { CreditNoteCreate } from './pages/finance/CreditNoteCreate';
import { CreditNoteDetail } from './pages/finance/CreditNoteDetail';
import { DebitNoteDetail } from './pages/finance/DebitNoteDetail';
import { PaymentDetail } from './pages/finance/PaymentDetail';
import { QuotationList } from './pages/finance/QuotationList';
import { QuotationCreate } from './pages/finance/QuotationCreate';
import { QuotationDetail } from './pages/finance/QuotationDetail';
import { ExpenseList } from './pages/expenses/ExpenseList';
import { ExpenseCreate } from './pages/expenses/ExpenseCreate';
import { ExpenseDetail } from './pages/expenses/ExpenseDetail';
import { ExpenseCategoryManage } from './pages/expenses/ExpenseCategoryManage';
import { ConsignmentList } from './pages/consignments/ConsignmentList';
import { ConsignmentCreate } from './pages/consignments/ConsignmentCreate';
import { ConsignmentDetail } from './pages/consignments/ConsignmentDetail';
import { SorProformaList } from './pages/consignments/SorProformaList';
import { StatementGenerate } from './pages/statements/StatementGenerate';
import { CompanySettings } from './pages/settings/CompanySettings';
import { UserProfile } from './pages/settings/UserProfile';
import { UserManagement } from './pages/settings/UserManagement';
import { InvoiceReminders } from './pages/settings/InvoiceReminders';
import { AutomationScheduling } from './pages/settings/AutomationScheduling';
import { DataExport } from './pages/settings/DataExport';
import { SystemConfiguration } from './pages/settings/SystemConfiguration';
import { EmailSettings } from './pages/settings/EmailSettings';
import { DocumentSeries } from './pages/settings/DocumentSeries';
import { ContractTemplates } from './pages/settings/ContractTemplates';
import { PortalDashboard } from './pages/portal/PortalDashboard';
import { PortalSalesSummary } from './pages/portal/PortalSalesSummary';
import { PortalRoyalties } from './pages/portal/PortalRoyalties';
import { PortalContracts } from './pages/portal/PortalContracts';
import { PortalContractDetail } from './pages/portal/PortalContractDetail';
import { PortalPayments } from './pages/portal/PortalPayments';
import { PortalContact } from './pages/portal/PortalContact';
import { ReportsDashboard } from './pages/reports/ReportsDashboard';
import { ProfitLoss } from './pages/reports/ProfitLoss';
import { SalesReport } from './pages/reports/SalesReport';
import { OverdueAging } from './pages/reports/OverdueAging';
import { InventoryReport } from './pages/reports/InventoryReport';
import { AuthorRoyaltyReport } from './pages/reports/AuthorRoyaltyReport';
import { TitlePerformance } from './pages/reports/TitlePerformance';
import { PartnerPerformance } from './pages/reports/PartnerPerformance';
import { ChannelRevenue } from './pages/reports/ChannelRevenue';
import { Bestsellers } from './pages/reports/Bestsellers';
import { ExpenseTrends } from './pages/reports/ExpenseTrends';
import { CashFlowAnalysis } from './pages/reports/CashFlowAnalysis';
import { TaxReport } from './pages/reports/TaxReport';
import { PrintRunsReport } from './pages/reports/PrintRunsReport';
import { SorReconciliation } from './pages/reports/SorReconciliation';
import { RoyaltyDueReport } from './pages/reports/RoyaltyDueReport';
import { ReturnsList } from './pages/returns/ReturnsList';
import { ReturnsCreate } from './pages/returns/ReturnsCreate';
import { ReturnsDetail } from './pages/returns/ReturnsDetail';
import { SyncDashboard } from './pages/sync/SyncDashboard';
import { PurchaseOrderList } from './pages/finance/PurchaseOrderList';
import { PurchaseOrderCreate } from './pages/finance/PurchaseOrderCreate';
import { PurchaseOrderDetail } from './pages/finance/PurchaseOrderDetail';
import { CashSaleList } from './pages/sales/CashSaleList';
import { CashSaleCreate } from './pages/sales/CashSaleCreate';
import { CashSaleDetail } from './pages/sales/CashSaleDetail';
import { ExpenseClaimList } from './pages/expenses/ExpenseClaimList';
import { ExpenseClaimCreate } from './pages/expenses/ExpenseClaimCreate';
import { ExpenseClaimDetail } from './pages/expenses/ExpenseClaimDetail';
import { RequisitionList } from './pages/procurement/RequisitionList';
import { RequisitionCreate } from './pages/procurement/RequisitionCreate';
import { RequisitionDetail } from './pages/procurement/RequisitionDetail';
import { AuditLog } from './pages/admin/AuditLog';
import { DeletionRequests } from './pages/admin/DeletionRequests';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { NotFound } from './pages/NotFound';
// Partner Portal (public-facing for channel partners)
import { PartnerPortalLayout } from './components/PartnerPortalLayout';
import { PartnerLogin } from './pages/partner-portal/PartnerLogin';
import { PartnerDashboard } from './pages/partner-portal/PartnerDashboard';
import { PartnerCatalog } from './pages/partner-portal/PartnerCatalog';
import { PartnerOrders } from './pages/partner-portal/PartnerOrders';
import { PartnerOrderDetail } from './pages/partner-portal/PartnerOrderDetail';
import { PartnerInvoices } from './pages/partner-portal/PartnerInvoices';
import { PartnerCreditNotes } from './pages/partner-portal/PartnerCreditNotes';
import { PartnerConsignments } from './pages/partner-portal/PartnerConsignments';
import { PartnerStatements } from './pages/partner-portal/PartnerStatements';
import { PartnerReturns } from './pages/partner-portal/PartnerReturns';
import { PartnerReturnCreate } from './pages/partner-portal/PartnerReturnCreate';
import { PartnerReturnDetail } from './pages/partner-portal/PartnerReturnDetail';
import { PartnerShipments } from './pages/partner-portal/PartnerShipments';
import { PartnerRemittances } from './pages/partner-portal/PartnerRemittances';
import { PartnerRemittanceCreate } from './pages/partner-portal/PartnerRemittanceCreate';
import { PartnerRemittanceDetail } from './pages/partner-portal/PartnerRemittanceDetail';
import { PartnerBranchActivity } from './pages/partner-portal/PartnerBranchActivity';
import { PartnerAccount } from './pages/partner-portal/PartnerAccount';
import { PartnerNotifications } from './pages/partner-portal/PartnerNotifications';
// Admin partner portal management
import { PartnerPortalUsers } from './pages/partners/PartnerPortalUsers';
import { PartnerOrdersAdmin } from './pages/partners/PartnerOrdersAdmin';
import { PartnerReturnRequestsAdmin } from './pages/partners/PartnerReturnRequestsAdmin';
import { CourierShipmentsAdmin } from './pages/partners/CourierShipmentsAdmin';
import { NotificationList } from './pages/notifications/NotificationList';
import { RoyaltiesAdmin } from './pages/royalties/RoyaltiesAdmin';
import { DocumentsSearch } from './pages/documents/DocumentsSearch';
// Budgeting
import { BudgetDashboard } from './pages/budgeting/BudgetDashboard';
import { ProjectList } from './pages/budgeting/ProjectList';
import { ProjectForm } from './pages/budgeting/ProjectForm';
import { ProjectDetail } from './pages/budgeting/ProjectDetail';
import { RateCardList } from './pages/budgeting/RateCardList';
import { RateCardForm } from './pages/budgeting/RateCardForm';
import { TimesheetList } from './pages/budgeting/TimesheetList';
import { SowList } from './pages/budgeting/SowList';
import { SowCreate } from './pages/budgeting/SowCreate';
import { SowDetail } from './pages/budgeting/SowDetail';
import { TimesheetCreate } from './pages/budgeting/TimesheetCreate';
import { TimesheetDetail } from './pages/budgeting/TimesheetDetail';

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },

  // Admin / Staff layout
  {
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },

      // Authors
      { path: 'authors', element: <AuthorList /> },
      { path: 'authors/new', element: <AuthorForm /> },
      { path: 'authors/:id', element: <AuthorDetail /> },
      { path: 'authors/:id/edit', element: <AuthorForm /> },

      // Titles
      { path: 'titles', element: <TitleList /> },
      { path: 'titles/new', element: <TitleForm /> },
      { path: 'titles/:id', element: <TitleDetail /> },
      { path: 'titles/:id/edit', element: <TitleForm /> },

      // Channel Partners
      { path: 'partners', element: <PartnerList /> },
      { path: 'partners/new', element: <PartnerForm /> },
      { path: 'partners/:id', element: <PartnerDetail /> },
      { path: 'partners/:id/edit', element: <PartnerForm /> },

      // Inventory
      { path: 'inventory', element: <InventoryDashboard /> },
      { path: 'inventory/receive', element: <StockAdjustment mode="receive" /> },
      { path: 'inventory/adjust', element: <StockAdjustment mode="adjust" /> },
      { path: 'inventory/stock-take', element: <StockTake /> },
      { path: 'inventory/:titleId/movements', element: <MovementHistory /> },

      // Invoices
      { path: 'invoices', element: <InvoiceList /> },
      { path: 'invoices/new', element: <InvoiceCreate /> },
      { path: 'invoices/:id', element: <InvoiceDetail /> },

      // Payments
      { path: 'payments', element: <PaymentList /> },
      { path: 'payments/new', element: <PaymentCreate /> },
      { path: 'payments/:id', element: <PaymentDetail /> },

      // Remittances
      { path: 'remittances', element: <RemittanceList /> },
      // Remittance creation moved to partner portal (partner self-service)
      // { path: 'remittances/new', element: <RemittanceCreate /> },
      { path: 'remittances/:id', element: <RemittanceDetail /> },

      // Debit Notes
      { path: 'debit-notes', element: <DebitNoteList /> },
      { path: 'debit-notes/new', element: <DebitNoteCreate /> },
      { path: 'debit-notes/:id', element: <DebitNoteDetail /> },

      // Credit Notes
      { path: 'credit-notes', element: <CreditNoteList /> },
      { path: 'credit-notes/new', element: <CreditNoteCreate /> },
      { path: 'credit-notes/:id', element: <CreditNoteDetail /> },

      // Quotations
      { path: 'quotations', element: <QuotationList /> },
      { path: 'quotations/new', element: <QuotationCreate /> },
      { path: 'quotations/:id', element: <QuotationDetail /> },

      // Purchase Orders
      { path: 'finance/purchase-orders', element: <PurchaseOrderList /> },
      { path: 'finance/purchase-orders/new', element: <PurchaseOrderCreate /> },
      { path: 'finance/purchase-orders/:id', element: <PurchaseOrderDetail /> },

      // Royalties
      { path: 'royalties', element: <RoyaltiesAdmin /> },

      // Documents search
      { path: 'documents', element: <DocumentsSearch /> },

      // Cash Sales
      { path: 'sales/cash-sales', element: <CashSaleList /> },
      { path: 'sales/cash-sales/new', element: <CashSaleCreate /> },
      { path: 'sales/cash-sales/:id', element: <CashSaleDetail /> },

      // Expenses
      { path: 'expenses', element: <ExpenseList /> },
      { path: 'expenses/new', element: <ExpenseCreate /> },
      { path: 'expenses/:id', element: <ExpenseDetail /> },
      { path: 'expenses/categories', element: <ExpenseCategoryManage /> },

      // Expense Claims
      { path: 'expenses/claims', element: <ExpenseClaimList /> },
      { path: 'expenses/claims/new', element: <ExpenseClaimCreate /> },
      { path: 'expenses/claims/:id', element: <ExpenseClaimDetail /> },

      // Requisitions
      { path: 'procurement/requisitions', element: <RequisitionList /> },
      { path: 'procurement/requisitions/new', element: <RequisitionCreate /> },
      { path: 'procurement/requisitions/:id', element: <RequisitionDetail /> },

      // Consignments
      { path: 'consignments', element: <ConsignmentList /> },
      { path: 'consignments/new', element: <ConsignmentCreate /> },
      { path: 'consignments/proformas', element: <SorProformaList /> },
      { path: 'consignments/:id', element: <ConsignmentDetail /> },

      // Returns
      { path: 'returns', element: <ReturnsList /> },
      { path: 'returns/new', element: <ReturnsCreate /> },
      { path: 'returns/:id', element: <ReturnsDetail /> },

      // Project Budgeting
      { path: 'budgeting', element: <BudgetDashboard /> },
      { path: 'budgeting/projects', element: <ProjectList /> },
      { path: 'budgeting/projects/new', element: <ProjectForm /> },
      { path: 'budgeting/projects/:id', element: <ProjectDetail /> },
      { path: 'budgeting/projects/:id/edit', element: <ProjectForm /> },
      { path: 'budgeting/rate-cards', element: <RateCardList /> },
      { path: 'budgeting/rate-cards/new', element: <RateCardForm /> },
      { path: 'budgeting/rate-cards/:id/edit', element: <RateCardForm /> },
      { path: 'budgeting/timesheets', element: <TimesheetList /> },
      { path: 'budgeting/timesheets/new', element: <TimesheetCreate /> },
      { path: 'budgeting/timesheets/:id', element: <TimesheetDetail /> },
      { path: 'budgeting/sow', element: <SowList /> },
      { path: 'budgeting/sow/new', element: <SowCreate /> },
      { path: 'budgeting/sow/:id', element: <SowDetail /> },

      // Notifications
      { path: 'notifications', element: <NotificationList /> },

      // Statements
      { path: 'statements', element: <StatementGenerate /> },

      // Reports
      { path: 'reports', element: <ReportsDashboard /> },
      { path: 'reports/profit-loss', element: <ProfitLoss /> },
      { path: 'reports/sales', element: <SalesReport /> },
      { path: 'reports/overdue-aging', element: <OverdueAging /> },
      { path: 'reports/inventory', element: <InventoryReport /> },
      { path: 'reports/author-royalty', element: <AuthorRoyaltyReport /> },
      { path: 'reports/title-performance', element: <TitlePerformance /> },
      { path: 'reports/partner-performance', element: <PartnerPerformance /> },
      { path: 'reports/channel-revenue', element: <ChannelRevenue /> },
      { path: 'reports/bestsellers', element: <Bestsellers /> },
      { path: 'reports/expense-trends', element: <ExpenseTrends /> },
      { path: 'reports/cash-flow', element: <CashFlowAnalysis /> },
      { path: 'reports/tax', element: <TaxReport /> },
      { path: 'reports/print-runs', element: <PrintRunsReport /> },
      { path: 'reports/sor-reconciliation', element: <SorReconciliation /> },
      { path: 'reports/royalty-due', element: <RoyaltyDueReport /> },

      // Sync
      { path: 'sync', element: <SyncDashboard /> },

      // Settings (admin)
      { path: 'settings', element: <CompanySettings /> },
      { path: 'settings/profile', element: <UserProfile /> },
      { path: 'settings/users', element: <UserManagement /> },
      { path: 'settings/reminders', element: <InvoiceReminders /> },
      { path: 'settings/scheduling', element: <AutomationScheduling /> },
      { path: 'settings/export', element: <DataExport /> },
      { path: 'settings/system', element: <SystemConfiguration /> },
      { path: 'settings/email', element: <EmailSettings /> },
      { path: 'settings/document-series', element: <DocumentSeries /> },
      { path: 'settings/contract-templates', element: <ContractTemplates /> },

      // Partner Portal Management (admin)
      { path: 'partners/portal-users', element: <PartnerPortalUsers /> },
      { path: 'partners/portal-orders', element: <PartnerOrdersAdmin /> },
      { path: 'partners/return-requests', element: <PartnerReturnRequestsAdmin /> },
      { path: 'partners/courier-shipments', element: <CourierShipmentsAdmin /> },

      // Notifications
      { path: 'notifications', element: <NotificationList /> },

      // Admin — Audit & Deletion
      { path: 'admin/audit-log', element: <AuditLog /> },
      { path: 'admin/deletion-requests', element: <DeletionRequests /> },

      // 404
      { path: '*', element: <NotFound /> },
    ],
  },

  // Partner Portal (channel partners login separately)
  { path: 'partner/login', element: <PartnerLogin /> },
  {
    element: <PartnerPortalLayout />,
    children: [
      { path: 'partner', element: <PartnerDashboard /> },
      { path: 'partner/catalog', element: <PartnerCatalog /> },
      { path: 'partner/orders', element: <PartnerOrders /> },
      { path: 'partner/orders/:id', element: <PartnerOrderDetail /> },
      { path: 'partner/invoices', element: <PartnerInvoices /> },
      { path: 'partner/credit-notes', element: <PartnerCreditNotes /> },
      { path: 'partner/consignments', element: <PartnerConsignments /> },
      { path: 'partner/statements', element: <PartnerStatements /> },
      { path: 'partner/remittances', element: <PartnerRemittances /> },
      { path: 'partner/remittances/new', element: <PartnerRemittanceCreate /> },
      { path: 'partner/remittances/:id', element: <PartnerRemittanceDetail /> },
      { path: 'partner/branches', element: <PartnerBranchActivity /> },
      { path: 'partner/returns', element: <PartnerReturns /> },
      { path: 'partner/returns/new', element: <PartnerReturnCreate /> },
      { path: 'partner/returns/:id', element: <PartnerReturnDetail /> },
      { path: 'partner/shipments', element: <PartnerShipments /> },
      { path: 'partner/notifications', element: <PartnerNotifications /> },
      { path: 'partner/account', element: <PartnerAccount /> },
    ],
  },

  // Author Portal layout
  {
    element: (
      <ProtectedRoute allowedRoles={['author']}>
        <PortalLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: 'portal', element: <PortalDashboard /> },
      { path: 'portal/sales', element: <PortalSalesSummary /> },
      { path: 'portal/royalties', element: <PortalRoyalties /> },
      { path: 'portal/contracts', element: <PortalContracts /> },
      { path: 'portal/contracts/:id', element: <PortalContractDetail /> },
      { path: 'portal/payments', element: <PortalPayments /> },
      { path: 'portal/contact', element: <PortalContact /> },
    ],
  },
]);

export function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
