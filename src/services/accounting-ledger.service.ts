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

  async listDispatchedOrders(filters: { from?: string | null; to?: string | null } = {}) {
    if (!this.db.configured) {
      return this.buildLedgerResponse(false, []);
    }

    await this.ensureSchema();
    const rows = await this.db.query<{
      order_id: string;
      customer_phone: string;
      customer_name: string | null;
      fulfillment_type: string;
      address: string | null;
      neighborhood: string | null;
      address_reference: string | null;
      payment_method: string | null;
      subtotal: number;
      delivery_fee: number;
      discount_total: number;
      total: number;
      status: string;
      dispatched_at: string;
      order_created_at: string;
      order_updated_at: string;
      order_snapshot: unknown;
    }>(
      `
      select
        order_id,
        customer_phone,
        customer_name,
        fulfillment_type,
        address,
        neighborhood,
        address_reference,
        payment_method,
        subtotal,
        delivery_fee,
        discount_total,
        total,
        status,
        dispatched_at,
        order_created_at,
        order_updated_at,
        order_snapshot
      from accounting_dispatched_orders
      where ($1::timestamptz is null or dispatched_at >= $1::timestamptz)
        and ($2::timestamptz is null or dispatched_at <= $2::timestamptz)
      order by dispatched_at desc
      limit 500
      `,
      [filters.from || null, filters.to || null]
    );

    return this.buildLedgerResponse(true, rows.map((row) => ({
      orderId: row.order_id,
      customerPhone: row.customer_phone,
      customerName: row.customer_name,
      fulfillmentType: row.fulfillment_type,
      address: row.address,
      neighborhood: row.neighborhood,
      addressReference: row.address_reference,
      paymentMethod: row.payment_method,
      subtotal: Number(row.subtotal),
      deliveryFee: Number(row.delivery_fee),
      discountTotal: Number(row.discount_total),
      total: Number(row.total),
      status: row.status,
      dispatchedAt: row.dispatched_at,
      orderCreatedAt: row.order_created_at,
      orderUpdatedAt: row.order_updated_at,
      orderSnapshot: row.order_snapshot
    })));
  }

  toCsv(rows: Array<Record<string, unknown>>) {
    const columns = [
      "orderId",
      "dispatchedAt",
      "customerPhone",
      "customerName",
      "address",
      "neighborhood",
      "addressReference",
      "paymentMethod",
      "subtotal",
      "deliveryFee",
      "discountTotal",
      "total",
      "status"
    ];
    return [
      columns.join(","),
      ...rows.map((row) => columns.map((column) => this.csvCell(row[column])).join(","))
    ].join("\n");
  }

  private async ensureSchema() {
    this.schemaReady ??= this.db.query(createAccountingTableSql).then(() => undefined);
    return this.schemaReady;
  }

  private buildLedgerResponse(configured: boolean, rows: Array<Record<string, unknown>>) {
    const byPaymentMethod = rows.reduce<Record<string, { count: number; total: number }>>((acc, row) => {
      const method = String(row.paymentMethod ?? "Sin metodo");
      const total = Number(row.total ?? 0);
      acc[method] ??= { count: 0, total: 0 };
      acc[method].count += 1;
      acc[method].total += total;
      return acc;
    }, {});

    return {
      configured,
      rows,
      summary: {
        orderCount: rows.length,
        totalSales: rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
        byPaymentMethod
      }
    };
  }

  private csvCell(value: unknown) {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }
}
