import { demoStore } from "../data/demoStore.js";
import { BotIntegrationService } from "../services/bot-integration.service.js";
import { AgentFlowTurnService } from "../services/agent-flow-turn.service.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

demoStore.conversations = [];
demoStore.messages = [];
demoStore.orders = [];

const service = new BotIntegrationService();

const traditionalProduct = demoStore.products.find((product) => product.name === "Fresas con crema tradicional");
assert(traditionalProduct, "traditional product should exist");
const originalTraditionalStock = traditionalProduct.isOutOfStock;
traditionalProduct.isOutOfStock = true;

const availableCatalog = service.getAvailableCatalog();
assert(
  !availableCatalog.productos.some((product) => product.id === traditionalProduct.id),
  "out of stock product should not be listed as available"
);
assert(
  availableCatalog.agotados.productos.some((product) => product.id === traditionalProduct.id),
  "out of stock product should be exposed in agotados for bot guardrails"
);

const agentFlowTurnService = new AgentFlowTurnService(service);
const unavailableTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: "availability-test",
  text: "quiero unas fresas tradicionales"
});
assert(
  unavailableTurn.source === "backend_catalog_availability",
  "unavailable product should be handled by backend before Flowise"
);
assert(
  String(unavailableTurn.responseText).toLowerCase().includes("agotado"),
  "unavailable product reply should say agotado"
);

traditionalProduct.isOutOfStock = originalTraditionalStock;

const oreoModifier = demoStore.modifierOptions.find((modifier) => modifier.name === "Oreo");
assert(oreoModifier, "Oreo modifier should exist");
const originalOreoActive = oreoModifier.isActive;
oreoModifier.isActive = false;

const unavailableModifierTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: "modifier-availability-test",
  text: "quiero unas fresas tradicionales con oreo"
});
assert(
  unavailableModifierTurn.source === "backend_catalog_availability",
  "unavailable modifier should be handled by backend before Flowise"
);
assert(
  String(unavailableModifierTurn.responseText).toLowerCase().includes("oreo") &&
    String(unavailableModifierTurn.responseText).toLowerCase().includes("agotado"),
  "unavailable modifier reply should mention the modifier as agotado"
);

oreoModifier.isActive = originalOreoActive;

const first = service.getOrCreateActiveConversation("telegram", "531515729");
assert(first.conversationState.items === "[]", "new conversation should start without items");
assert(first.conversationState.modalidad_entrega === "domicilio", "delivery should be default");

service.updateConversationState(first.id, {
  items: [
    {
      producto: "Fresas con crema tradicional",
      cantidad: 1,
      toppings: ["Oreo"]
    }
  ],
  customerMessage: "quiero unas fresas tradicionales con oreo",
  botMessage: "Perfecto, quieres agregar algo mas?"
});

const blockedReadiness = service.getOrderReviewReadiness(first.id);
assert(!blockedReadiness.ready, "incomplete order should not be ready for review");
assert(blockedReadiness.missingFields.includes("nombre"), "missing name should be detected");
assert(service.createOrderForReview(first.id) === null, "incomplete order must not create review order");

service.updateConversationState(first.id, {
  nombre: "Laura",
  direccion: "Cra 39A #41-99",
  barrio: "Cabecera del Llano",
  referencia: "Casa blanca",
  metodo_pago: "Nequi",
  modalidad_entrega: "domicilio"
});

const waitingPaymentReadiness = service.getOrderReviewReadiness(first.id);
assert(!waitingPaymentReadiness.ready, "transfer order should wait for payment proof");
assert(
  waitingPaymentReadiness.missingFields.includes("comprobante_pago"),
  "missing payment proof should be detected"
);
assert(
  service.createOrderForReview(first.id) === null,
  "transfer order must not create review order without payment proof"
);

service.updateConversationState(first.id, {
  pedido_confirmado_por_cliente: true,
  comprobante_pago_pendiente: true,
  next_expected: "comprobante_pago"
});

const waitingProof = service.getOrCreateActiveConversation("telegram", "531515729");
assert(
  waitingProof.conversationState.next_expected === "comprobante_pago",
  "conversation should wait for payment proof"
);

service.updateConversationState(first.id, {
  comprobante_pago_recibido: true,
  payment_proof_note: "comprobante enviado en Telegram",
  needs_human: true,
  next_expected: "humano"
});

const readyAfterProof = service.getOrderReviewReadiness(first.id);
assert(
  readyAfterProof.ready,
  `order with payment proof should be ready, missing: ${readyAfterProof.missingFields.join(", ")}`
);

const order = service.createOrderForReview(first.id);
assert(order, "complete order should create review order");
assert(order.status === "pending_review", "created order should be pending_review");
assert(order.pricing.deliveryFee === 5000, "default delivery fee should be 5000");
assert(order.pricing.total === 23000, "total should include item, topping and delivery fee");
assert(order.paymentProofReceived, "created review order should keep payment proof flag");

const turnChatId = "payment-turn-test";
const turnConversation = service.startNewConversation("telegram", turnChatId);
service.updateConversationState(turnConversation.id, {
  items: [
    {
      producto: "Fresas con crema tradicional",
      cantidad: 1
    }
  ],
  nombre: "Turn Test",
  direccion: "Cra 39A #41-99",
  barrio: "Cabecera del Llano",
  referencia: "Porteria",
  metodo_pago: "Nequi",
  modalidad_entrega: "domicilio"
});

const confirmedTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: turnChatId,
  text: "si"
});
assert(
  confirmedTurn.source === "backend_payment_instructions",
  "customer confirmation should be handled by backend payment instructions"
);
assert(
  String(confirmedTurn.responseText).includes("Nequi: 3000000000"),
  "payment instructions should include Nequi number"
);
assert(
  String(confirmedTurn.responseText).includes("Total: 21000"),
  "payment instructions should include total"
);
assert(!confirmedTurn.orderId, "payment instructions should not create order yet");

const offTopicTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: turnChatId,
  text: "que dia es hoy?"
});
assert(
  offTopicTurn.source === "backend_waiting_payment_proof",
  "off-topic message while waiting proof should be handled before Flowise"
);
assert(
  String(offTopicTurn.responseText).toLowerCase().includes("comprobante"),
  "off-topic response should redirect to payment proof"
);
assert(!offTopicTurn.orderId, "off-topic message should not create review order");

const proofTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: turnChatId,
  text: "adjunto comprobante"
});
assert(
  proofTurn.source === "backend_payment_proof_received",
  "payment proof should be handled by backend before Flowise"
);
assert(proofTurn.orderId, "payment proof should create review order");
assert(
  String(proofTurn.responseText).includes("dejo tu pedido en revision"),
  "payment proof response should mention review"
);

const originalTraditionalPrice = traditionalProduct.basePrice;
traditionalProduct.basePrice = 17000;
const priceConversation = service.startNewConversation("telegram", "price-test");
service.updateConversationState(priceConversation.id, {
  items: [
    {
      producto: "Fresas con crema tradicional",
      cantidad: 1
    }
  ],
  nombre: "Precio Test",
  direccion: "Cra 39A #41-99",
  barrio: "Cabecera del Llano",
  referencia: "Porteria",
  metodo_pago: "efectivo",
  modalidad_entrega: "domicilio"
});
const priceOrder = service.createOrderForReview(priceConversation.id);
assert(priceOrder, "price test order should be created");
assert(priceOrder.items[0]?.unitBasePrice === 17000, "order should use current catalog product price");
assert(priceOrder.pricing.total === 22000, "total should use current product price plus delivery");
traditionalProduct.basePrice = originalTraditionalPrice;

const second = service.startNewConversation("telegram", "531515729");
assert(second.id !== first.id, "/newchat should create a different conversation");
assert(second.conversationState.items === "[]", "/newchat should reset items");

console.log("bot-integration smoke OK");
