import { strict as assert } from "node:assert";
import { AccountingLedgerService } from "../services/accounting-ledger.service.js";
import type { Order } from "../types/index.js";

const queries: Array<{ sql: string; params?: unknown[] }> = [];
const db = {
  configured: true,
  query: async <T>(sql: string, params?: unknown[]) => {
    queries.push({ sql, params });
    return [{ order_id: "order_test" }] as T[];
  }
};

const service = new AccountingLedgerService(db);

const order: Order = {
  id: "order_test",
  createdAt: "2026-06-25T20:00:00.000Z",
  updatedAt: "2026-06-25T20:05:00.000Z",
  businessId: "biz_ilovefresas",
  customerPhone: "telegram:531515729",
  fulfillmentType: "delivery",
  customerName: "Cliente QA",
  address: "Cra 39A #41-99",
  neighborhood: "Cabecera del Llano",
  addressReference: "Porteria",
  zoneName: "Cabecera del Llano",
  paymentMethod: "Nequi",
  paymentProofReceived: true,
  paymentProofNote: "Validacion QA",
  cashAmount: null,
  notes: null,
  items: [
    {
      id: "item_test",
      productId: "prod_fresa_tradicional",
      productName: "Fresas con crema tradicional",
      quantity: 1,
      unitBasePrice: 16000,
      components: [],
      notes: null
    }
  ],
  pricing: {
    subtotal: 16000,
    deliveryFee: 5000,
    discountTotal: 0,
    total: 21000
  },
  status: "dispatched",
  internalNotes: "QA"
};

const result = await service.recordDispatchedOrder(order);
assert.equal(result.saved, true);
assert.equal(queries.length, 2, "should create schema and upsert accounting record");

const upsert = queries[1];
assert(upsert?.params, "upsert should include params");
assert.equal(upsert.params[0], "order_test");
assert.equal(upsert.params[2], "telegram:531515729");
assert.equal(upsert.params[3], "Cliente QA");
assert.equal(upsert.params[5], "Cra 39A #41-99");
assert.equal(upsert.params[6], "Cabecera del Llano");
assert.equal(upsert.params[8], "Nequi");
assert.equal(upsert.params[10], 16000);
assert.equal(upsert.params[11], 5000);
assert.equal(upsert.params[13], 21000);
assert.equal(upsert.params[14], "dispatched");

const skipped = await service.recordDispatchedOrder({
  ...order,
  id: "order_pending",
  status: "confirmed"
});
assert.equal(skipped.saved, false);
assert.equal(skipped.reason, "order_not_dispatched");
assert.equal(queries.length, 2, "non-dispatched orders should not hit database");

const noDbService = new AccountingLedgerService({
  configured: false,
  query: async <T>() => [] as T[]
});
const noDb = await noDbService.recordDispatchedOrder(order);
assert.equal(noDb.saved, false);
assert.equal(noDb.reason, "database_not_configured");

console.log("accounting-ledger smoke OK");
