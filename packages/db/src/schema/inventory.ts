import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { titles } from './titles';
import { users } from './users';

export const movementTypeEnum = pgEnum('movement_type', [
  'IN', 'CONSIGN', 'SELL', 'RETURN', 'ADJUST', 'WRITEOFF',
]);

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  titleId: uuid('title_id').notNull().references(() => titles.id),
  movementType: movementTypeEnum('movement_type').notNull(),
  fromLocation: varchar('from_location', { length: 50 }),
  toLocation: varchar('to_location', { length: 50 }),
  quantity: integer('quantity').notNull(),
  referenceId: uuid('reference_id'), // links to consignment, sale, etc.
  referenceType: varchar('reference_type', { length: 50 }), // CONSIGNMENT, SALE, ADJUSTMENT, PRINT_RUN
  reason: varchar('reason', { length: 255 }),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_inventory_title_id').on(t.titleId),
  index('idx_inventory_movement_type').on(t.movementType),
  index('idx_inventory_created_at').on(t.createdAt),
  index('idx_inventory_title_date').on(t.titleId, t.createdAt),
]);

export const inventoryMovementsRelations = relations(inventoryMovements, ({ one }) => ({
  title: one(titles, {
    fields: [inventoryMovements.titleId],
    references: [titles.id],
  }),
  createdByUser: one(users, {
    fields: [inventoryMovements.createdBy],
    references: [users.id],
  }),
}));
