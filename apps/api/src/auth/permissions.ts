import { createAccessControl } from 'better-auth/plugins/access';

// Define all resources and their possible actions
const statement = {
  user: ['create', 'list', 'update', 'delete', 'set-role', 'ban', 'impersonate'],
  author: ['create', 'read', 'update', 'delete'],
  title: ['create', 'read', 'update', 'delete'],
  consignment: ['create', 'read', 'update', 'delete', 'dispatch', 'reconcile'],
  invoice: ['create', 'read', 'update', 'void', 'approve'],
  payment: ['create', 'read', 'update', 'reconcile'],
  royalty: ['read', 'calculate', 'approve', 'pay'],
  inventory: ['read', 'adjust', 'write-off'],
  report: ['read', 'export'],
  settings: ['read', 'update'],
} as const;

export const ac = createAccessControl(statement);

// Admin: full access to everything
export const adminRole = ac.newRole({
  user: ['create', 'list', 'update', 'delete', 'set-role', 'ban', 'impersonate'],
  author: ['create', 'read', 'update', 'delete'],
  title: ['create', 'read', 'update', 'delete'],
  consignment: ['create', 'read', 'update', 'delete', 'dispatch', 'reconcile'],
  invoice: ['create', 'read', 'update', 'void', 'approve'],
  payment: ['create', 'read', 'update', 'reconcile'],
  royalty: ['read', 'calculate', 'approve', 'pay'],
  inventory: ['read', 'adjust', 'write-off'],
  report: ['read', 'export'],
  settings: ['read', 'update'],
});

// Finance: invoices, payments, royalties, reports
export const financeRole = ac.newRole({
  author: ['read'],
  title: ['read'],
  consignment: ['read'],
  invoice: ['create', 'read', 'update', 'void', 'approve'],
  payment: ['create', 'read', 'update', 'reconcile'],
  royalty: ['read', 'calculate', 'approve', 'pay'],
  report: ['read', 'export'],
});

// Operations: consignments, inventory, titles
export const operationsRole = ac.newRole({
  author: ['read'],
  title: ['create', 'read', 'update'],
  consignment: ['create', 'read', 'update', 'dispatch', 'reconcile'],
  invoice: ['read'],
  inventory: ['read', 'adjust', 'write-off'],
  report: ['read'],
});

// Editorial: authors, titles, content management
export const editorialRole = ac.newRole({
  author: ['create', 'read', 'update'],
  title: ['create', 'read', 'update'],
  consignment: ['read'],
  report: ['read'],
});

// Author: read-only access to own data
export const authorRole = ac.newRole({
  author: ['read'],
  title: ['read'],
  royalty: ['read'],
  report: ['read'],
});

// Reports Only: read-only dashboards
export const reportsOnlyRole = ac.newRole({
  report: ['read', 'export'],
});
