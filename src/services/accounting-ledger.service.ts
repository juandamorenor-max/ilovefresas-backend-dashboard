import { createPostgresClient } from "../db/postgres.js";
import type { Order } from "../types/index.js";
import { logger } from "../utils/logger.js";

const createAccountingTableSql = `
create table if not exists accounting_dispatched_orders (
  order_id text primary key,
  business_id text not null,
  customer_phone text not null,
  customer_name text,
  fulfillment_type text not null,
  address text,
  neighborhood text,
  address_reference text,
  payment_method text,
  cash_amount text,
  subtotal integer not null default 0,
  delivery_fee integer not null default 0,
  discount_total integer not null default 0,
  total integer not null default 0,
  status text not null,
  dispatched_at timestamptz not null,
  order_created_at timestamptz not null,
  order_updated_at timestamptz not null,
  order_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounting_dispatched_orders_business_date
  on accounting_dispatched_orders (business_id, dispatched_at desc);

create index if not exists idx_accounting_dispatched_orders_customer_phone
  on accounting_dispatched_orders (customer_phone);
`;

const upsertDispatchedOrderSql = `
insert into accounting_dispatched_orders (
  order_id,
  business_id,
  customer_phone,
  customer_name,
  fulfillment_type,
  address,
  neighborhood,
  address_reference,
  payment_method,
  cash_amount,
  subtotal,
  delivery_fee,
  discount_total,
  total,
  status,
  dispatched_at,
  order_created_at,
  order_updated_at,
  order_snapshot
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
  $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb
)
on conflict (order_id) do update set
  customer_phone = excluded.customer_phone,
  customer_name = excluded.customer_name,
  fulfillment_type = excluded.fulfillment_type,
  address = excluded.address,
  neighborhood = excluded.neighborhood,
  address_reference = excluded.address_reference,
  payment_method = excluded.payment_method,
  cash_amount = excluded.cash_amount,
  subtotal = excluded.subtotal,
  delivery_fee = excluded.delivery_fee,
  discount_total = excluded.discount_total,
  total = excluded.total,
  status = excluded.status,
  dispatched_at = excluded.dispatched_at,
  order_updated_at = excluded.order_updated_at,
  order_snapshot = excluded.order_snapshot,
  updated_at = now()
returning order_id;
`;

export class AccountingLedgerService {
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly db = createPostgresClient()) {}

  async recordDispatchedOrder(order: Order) {
    if (order.status !== "dispatched") {
      return { saved: false, reason: "order_not_dispatched" };
    }

    if (!this.db.configured) {
      return { saved: false, reason: "database_not_configured" };
    }

    try {
      await this.ensureSchema();
      await this.db.query(upsertDispatchedOrderSql, [
        order.id,
        order.businessId,
        order.customerPhone,
        order.customerName,
        order.fulfillmentType,
        order.address,
        order.neighborhood ?? order.zoneName,
        order.addressReference,
        order.paymentMethod,
        order.cashAmount,
        order.pricing.subtotal,
        order.pricing.deliveryFee,
        order.pricing.discountTotal,
        order.pricing.total,
        order.status,
        order.updatedAt,
        order.createdAt,
        order.updatedAt,
        JSON.stringify(order)
      ]);

      return { saved: true, reason: null };
    } catch (error) {
      logger.error("Accounting dispatched order persistence failed", {
        orderId: order.id,
        error: error instanceof Error ? error.message : "unknown"
      });
      return { saved: false, reason: "database_error" };
    }
  }

  private async ensureSchema() {
    this.schemaReady ??= this.db.query(createAccountingTableSql).then(() => undefined);
    return this.schemaReady;
  }
}
