import { strict as assert } from "node:assert";
import type { OrderDraft, OrderItem } from "../types/index.js";

process.env.NODE_ENV = "production";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_CHAT_ID = "";

const { CatalogService } = await import("../services/catalog.service.js");
const { ConversationService } = await import("../services/conversation.service.js");
const { OrderService } = await import("../services/order.service.js");

const catalogService = new CatalogService();
const orderService = new OrderService();
const conversationService = new ConversationService();

const product = catalogService.findProductByNameOrAlias("Fresas con helado");
assert(product, "Expected Fresas con helado in catalog");

const item: OrderItem = {
  id: "item_test_required_qty",
  productId: product.id,
  productName: product.name,
  quantity: 4,
  unitBasePrice: product.basePrice,
  components: product.defaultComponents.map((name) => ({
    name,
    type: "default",
    priceDelta: 0
  })),
  selectedOptions: {},
  notes: null
};

const draft: OrderDraft = orderService.refreshDraft({
  id: "draft_test_required_qty",
  businessId: product.businessId,
  customerPhone: "qa-required-option-quantities",
  items: [item],
  fulfillmentType: "delivery",
  customerName: null,
  address: null,
  inferredZoneId: null,
  paymentMethod: null,
  cashAmount: null,
  notes: null,
  pendingSelections: [],
  blockingIssue: null,
  pricing: {
    subtotal: 0,
    deliveryFee: 0,
    discountTotal: 0,
    total: 0
  }
});

const applied = (conversationService as unknown as {
  applyRequiredOptionReply: (draft: OrderDraft, text: string) => boolean;
  buildCartSummary: (draft: OrderDraft) => string;
}).applyRequiredOptionReply(draft, "2 de vainilla y 2 de chocolate");

assert.equal(applied, true);
assert.deepEqual(item.selectedOptions?.iceCreamFlavor, ["Vainilla", "Chocolate"]);
assert.deepEqual(item.selectedOptionQuantities?.iceCreamFlavor, {
  Vainilla: 2,
  Chocolate: 2
});

const summary = (conversationService as unknown as {
  buildCartSummary: (draft: OrderDraft) => string;
}).buildCartSummary(draft);

assert.match(summary, /sabor de helado: Vainilla x2, Chocolate x2/i);

const waffle = catalogService.findProductByNameOrAlias("Waffle Tradicional");
assert(waffle, "Expected Waffle Tradicional in catalog");

const waffleItem: OrderItem = {
  id: "item_test_three_waffles",
  productId: waffle.id,
  productName: waffle.name,
  quantity: 3,
  unitBasePrice: waffle.basePrice,
  components: waffle.defaultComponents.map((name) => ({
    name,
    type: "default",
    priceDelta: 0
  })),
  selectedOptions: {},
  notes: null
};

const waffleDraft: OrderDraft = orderService.refreshDraft({
  id: "draft_test_three_waffles",
  businessId: waffle.businessId,
  customerPhone: "qa-required-option-three-waffles",
  items: [waffleItem],
  fulfillmentType: "delivery",
  customerName: null,
  address: null,
  inferredZoneId: null,
  paymentMethod: null,
  cashAmount: null,
  notes: null,
  pendingSelections: [],
  blockingIssue: null,
  pricing: {
    subtotal: 0,
    deliveryFee: 0,
    discountTotal: 0,
    total: 0
  }
});

(conversationService as unknown as {
  syncPendingSelectionsFromRequiredOptions: (draft: OrderDraft) => void;
}).syncPendingSelectionsFromRequiredOptions(waffleDraft);

const waffleQuestion = waffleDraft.pendingSelections[0]?.question ?? "";
assert.match(waffleQuestion, /Para tu primer waffle/i);
assert.match(waffleQuestion, /fruta/i);
assert.match(waffleQuestion, /sabor de helado/i);
assert.match(waffleQuestion, /salsa/i);

waffleItem.selectedOptions = {
  fruit: ["Fresa"],
  iceCreamFlavor: ["Vainilla"],
  sauce: ["Nutella"]
};
waffleItem.selectedOptionQuantities = {
  fruit: { Fresa: 1 },
  iceCreamFlavor: { Vainilla: 1 },
  sauce: { Nutella: 1 }
};

(conversationService as unknown as {
  syncPendingSelectionsFromRequiredOptions: (draft: OrderDraft) => void;
}).syncPendingSelectionsFromRequiredOptions(waffleDraft);

const secondWaffleQuestion = waffleDraft.pendingSelections[0]?.question ?? "";
assert.match(secondWaffleQuestion, /Para tu segundo waffle/i);
assert.match(secondWaffleQuestion, /fruta/i);
assert.match(secondWaffleQuestion, /sabor de helado/i);
assert.match(secondWaffleQuestion, /salsa/i);

console.log(
  JSON.stringify(
    {
      ok: true,
      selectedOptions: item.selectedOptions,
      selectedOptionQuantities: item.selectedOptionQuantities,
      waffleQuestion,
      secondWaffleQuestion,
      summary
    },
    null,
    2
  )
);
