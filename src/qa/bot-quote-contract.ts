import { demoStore } from "../data/demoStore.js";
import { env } from "../config/env.js";
import { BotIntegrationService } from "../services/bot-integration.service.js";
import { BotQuoteService } from "../services/bot-quote.service.js";
import { AgentFlowTurnService } from "../services/agent-flow-turn.service.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

demoStore.conversations = [];
demoStore.orders = [];
demoStore.botQuotes = [];

const conversations = new BotIntegrationService();
const quotes = new BotQuoteService();
const conversation = conversations.startNewConversation("telegram", "quote-contract");

const flowTurn = new AgentFlowTurnService();
const extracted = (
  flowTurn as unknown as {
    extractFlowisePatch(response: Record<string, unknown>): Record<string, unknown>;
  }
).extractFlowisePatch({
  text: "validated reply",
  items: [],
  agentFlowExecutedData: [{
    data: {
      output: {
        content: JSON.stringify({
          items: [{
            id: "waffle_from_custom_function",
            productId: "prod_waffle_tradicional",
            producto: "Waffle Tradicional",
            quantity: 1
          }],
          reply: "validated reply"
        })
      }
    }
  }]
});
assert(
  Array.isArray(extracted.items) && extracted.items.length === 1,
  "validated Custom Function items must override stale top-level state"
);

env.TURN_DECISION_OWNER = "agents";
const mirrored = conversations.updateConversationState(conversation.id, {
  customerMessage: "fresa",
  stage: "pedido",
  pending_action: "configure_item",
  target_item_id: "waffle_1",
  target_option_key: "iceCreamFlavor",
  next_expected: "pedido",
  items: [
    {
      id: "waffle_1",
      productId: "prod_waffle_tradicional",
      quantity: 1,
      selectedOptions: { fruit: ["Fresa"] }
    },
    {
      id: "waffle_2",
      productId: "prod_waffle_tradicional",
      quantity: 1,
      selectedOptions: {}
    }
  ]
});
assert(mirrored?.draftOrder?.items.length === 2, "agent state must preserve independent units");
assert(mirrored.draftOrder.items[0]?.id === "waffle_1", "agent item IDs must remain stable");
assert(
  mirrored.draftOrder.items[0]?.selectedOptions?.fruit?.[0] === "Fresa",
  "a short required-option answer must be mirrored without repeating the product name"
);
const mirroredStateItems = JSON.parse(String(mirrored.conversationState.items));
assert(mirroredStateItems[0]?.id === "waffle_1", "rehydrated state must include stable item IDs");
assert(
  mirrored.conversationState.next_expected === "pedido",
  "incomplete agent-owned items must remain in pedido"
);
assert(
  mirrored.conversationState.pending_action === "configure_item" &&
    mirrored.conversationState.target_item_id === "waffle_1",
  "agent focus must persist between Flowise executions"
);
const askingMore = conversations.updateConversationState(conversation.id, {
  pending_action: "ask_more_products",
  stage: "datos",
  next_expected: "datos"
});
assert(
  askingMore?.conversationState.next_expected === "pedido" &&
    askingMore.conversationState.stage === "pedido",
  "ask_more_products must remain in pedido even if a stale Flowise field says datos"
);
assert(
  askingMore.conversationState.target_item_id === "" &&
    askingMore.conversationState.target_option_key === "",
  "ask_more_products must clear the required-option focus"
);
const messageOnly = conversations.updateConversationState(conversation.id, {
  botMessage: "¿Quieres agregar otro producto?"
});
assert(
  messageOnly?.conversationState.next_expected === "pedido",
  "saving a bot message without a decision must preserve the previous stage"
);

const grouped = quotes.createQuote({
  conversationId: conversation.id,
  items: [{
    productId: "prod_waffle_tradicional",
    quantity: 2,
    selectedOptions: {
      fruit: ["Fresa"],
      iceCreamFlavor: ["Vainilla"],
      sauce: ["Arequipe"]
    }
  }]
});
assert(
  grouped.blockingErrors.some((error) => error.startsWith("configurable_product_requires_unit_items")),
  "configurable products with quantity > 1 must be rejected"
);

const quote = quotes.createQuote({
  conversationId: conversation.id,
  fulfillmentType: "delivery",
  neighborhood: "Cabecera del Llano",
  items: [
    {
      id: "waffle_1",
      productId: "prod_waffle_tradicional",
      quantity: 1,
      selectedOptions: {
        fruit: ["Fresa"],
        iceCreamFlavor: ["Vainilla"],
        sauce: ["Arequipe"]
      }
    },
    {
      id: "waffle_2",
      productId: "prod_waffle_tradicional",
      quantity: 1,
      selectedOptions: {
        fruit: ["Banano"],
        iceCreamFlavor: ["Chocolate"],
        sauce: ["Nutella"]
      }
    }
  ]
});
assert(quote.blockingErrors.length === 0, "complete unit items should produce a quote");
assert(quote.normalizedItems.length === 2, "quote should preserve two independent waffles");
assert(quote.subtotal === 30000, "quote subtotal should come from catalog prices");
assert(quote.deliveryFee === 5000, "quote should calculate delivery fee");
assert(quote.total === 35000, "quote should calculate deterministic total");

const order = quotes.confirmOrder({
  quoteId: quote.quoteId,
  conversationId: conversation.id,
  customer: {
    name: "Cliente QA",
    address: "Cra 39A # 41-99",
    neighborhood: "Cabecera del Llano",
    reference: "Casa blanca"
  },
  paymentMethod: "Contra entrega"
});
assert(order.status === "pending_review", "confirmed quote should create pending_review order");
assert(order.items.length === 2, "confirmed order should preserve unit item configurations");

let duplicateRejected = false;
try {
  quotes.confirmOrder({
    quoteId: quote.quoteId,
    conversationId: conversation.id,
    customer: {
      name: "Cliente QA",
      address: "Cra 39A # 41-99",
      neighborhood: "Cabecera del Llano",
      reference: "Casa blanca"
    },
    paymentMethod: "Contra entrega"
  });
} catch {
  duplicateRejected = true;
}
assert(duplicateRejected, "consumed quote must not create a duplicate order");

console.log("Bot quote contract QA passed.");
