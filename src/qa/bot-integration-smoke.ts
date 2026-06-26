import { demoStore } from "../data/demoStore.js";
import { BotIntegrationService } from "../services/bot-integration.service.js";
import { AgentFlowTurnService } from "../services/agent-flow-turn.service.js";
import { ConversationService } from "../services/conversation.service.js";

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
const menuPdfTurn = await agentFlowTurnService.handleTurn({
  channel: "whatsapp",
  chatId: "menu-pdf-test",
  text: "menu"
});
assert(
  menuPdfTurn.source === "backend_menu_pdf",
  "menu request should be handled by backend before Flowise"
);
assert(
  String(menuPdfTurn.responseText).includes("Menu 2026"),
  "menu request should mention Menu 2026"
);
assert(
  Array.isArray(menuPdfTurn.attachments) &&
    menuPdfTurn.attachments[0]?.filename === "Menu 2026.pdf",
  "menu request should include Menu 2026 PDF attachment metadata"
);

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

const unexpectedAttachmentTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: "unexpected-attachment-test",
  text: "",
  hasAttachment: true,
  attachmentType: "image",
  attachmentFileId: "telegram-photo-before-order"
});
assert(
  unexpectedAttachmentTurn.source === "backend_unexpected_attachment",
  "image outside payment proof step should be handled by backend before Flowise"
);
assert(!unexpectedAttachmentTurn.orderId, "unexpected image should not create review order");
assert(
  String(unexpectedAttachmentTurn.responseText).toLowerCase().includes("pedido"),
  "unexpected image response should redirect to order flow"
);

const prematureTextProofTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: "premature-text-proof-test",
  text: "ya envie el comprobante nequi"
});
assert(
  prematureTextProofTurn.source === "backend_premature_payment_proof",
  "text proof before payment proof step should be handled by backend before Flowise"
);
assert(!prematureTextProofTurn.orderId, "premature text proof should not create review order");
assert(
  String(prematureTextProofTurn.responseText).toLowerCase().includes("todavia no puedo recibir comprobantes"),
  "premature text proof response should explain proof is only after total"
);

const mixOreoProduct = demoStore.products.find((product) => product.name === "Mix Oreo");
assert(mixOreoProduct, "Mix Oreo product should exist");
const originalMixOreoAliases = [...mixOreoProduct.aliases];
mixOreoProduct.aliases = originalMixOreoAliases.filter(
  (alias) => alias.toLowerCase() !== "oreo mix"
);

const oneLineOrderNoPersistedAliasTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: "one-line-order-no-alias-test",
  text: "oreo mix para cra 39a #41-99 a miramar, Juan Pepito, es una casa y te pago por nequi"
});
assert(
  oneLineOrderNoPersistedAliasTurn.source === "backend_one_line_order",
  "one-line order should not depend on persisted Oreo Mix alias"
);
assert(
  String(oneLineOrderNoPersistedAliasTurn.responseText).includes("1 x Mix Oreo"),
  "one-line order without alias should still recognize Mix Oreo"
);
assert(
  String(oneLineOrderNoPersistedAliasTurn.responseText).includes("Direccion: cra 39a #41-99"),
  "one-line order should extract address without requiring a space after #"
);
assert(
  String(oneLineOrderNoPersistedAliasTurn.responseText).includes("Total: $25,000"),
  "one-line order without alias should include confirmation summary"
);

mixOreoProduct.aliases = originalMixOreoAliases;

const oneLineOrderTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: "one-line-order-test",
  text: "oreo mix para cra 39a # 41-99 a miramar, Juan Pepito, es una casa y te pago por nequi"
});
assert(
  oneLineOrderTurn.source === "backend_one_line_order",
  "product, address, name and payment in one line should be handled by backend"
);
assert(
  String(oneLineOrderTurn.responseText).includes("1 x Mix Oreo"),
  "one-line order should recognize Oreo Mix as Mix Oreo"
);
assert(
  String(oneLineOrderTurn.responseText).includes("Nombre: Juan Pepito"),
  "one-line order should extract customer name"
);
assert(
  String(oneLineOrderTurn.responseText).includes("Direccion: cra 39a # 41-99"),
  "one-line order should extract address"
);
assert(
  String(oneLineOrderTurn.responseText).includes("Barrio: miramar"),
  "one-line order should extract neighborhood"
);
assert(
  String(oneLineOrderTurn.responseText).includes("Metodo de pago: Nequi"),
  "one-line order should extract payment method"
);
assert(
  String(oneLineOrderTurn.responseText).includes("Total: $25,000"),
  "one-line order should include total with comma thousands"
);

const guardrailConversation = service.getOrCreateActiveConversation(
  "telegram",
  "actionless-flowise-reply-test"
);
service.updateConversationState(guardrailConversation.id, {
  items: [{ producto: "Mix Oreo", cantidad: 1, precio_unitario: 20000 }],
  nombre: "Juan Pepito",
  direccion: "cra 39a #41-99",
  barrio: "miramar",
  referencia: "es una casa",
  metodo_pago: "Nequi",
  modalidad_entrega: "domicilio"
});
const guardrailNextStep = service.buildNextOrderStepReply(guardrailConversation.id);
assert(
  guardrailNextStep?.nextExpected === "confirmacion",
  "complete draft should continue to confirmation instead of stopping"
);
assert(
  String(guardrailNextStep?.responseText).includes("Resumen de tu pedido:"),
  "complete draft guardrail should generate a summary"
);

const requiredOptionsConversation = service.getOrCreateActiveConversation(
  "telegram",
  "required-options-waffles-fresas-test"
);
service.updateConversationState(requiredOptionsConversation.id, {
  items: [
    { producto: "Waffle Tradicional", cantidad: 2, precio_unitario: 15000 },
    { producto: "Waffle Chocolate", cantidad: 1, precio_unitario: 15000 },
    { producto: "Fresas con helado", cantidad: 1, precio_unitario: 18000 }
  ],
  nombre: "Juan Moreno",
  direccion: "cra 39a # 41-99",
  barrio: "miramar",
  referencia: "casa",
  metodo_pago: "Nequi",
  modalidad_entrega: "domicilio"
});
const blockedRequiredOptions = service.getOrderReviewReadiness(requiredOptionsConversation.id);
assert(
  blockedRequiredOptions.missingFields.includes("opciones_obligatorias"),
  "order with waffles and ice cream strawberries should require missing options before review"
);
assert(
  !service.createOrderForReview(requiredOptionsConversation.id),
  "order with missing required options must not be sent to review"
);
const requiredOptionsQuestion = service.buildNextOrderStepReply(requiredOptionsConversation.id);
assert(
  requiredOptionsQuestion?.source === "backend_required_options_guardrail",
  "missing required options should be handled by backend guardrail"
);
assert(
  String(requiredOptionsQuestion?.responseText).includes("Waffle Tradicional") &&
    String(requiredOptionsQuestion?.responseText).includes("Waffle Chocolate") &&
    String(requiredOptionsQuestion?.responseText).includes("Fresas con helado") &&
    String(requiredOptionsQuestion?.responseText).includes("sabor de helado") &&
    String(requiredOptionsQuestion?.responseText).includes("salsa"),
  "required options question should list all missing waffle and ice cream options"
);
const requiredOptionsAnswer = service.handleRequiredOptionsTurn(
  requiredOptionsConversation.id,
  "para los waffles fruta fresa, helado vainilla y salsa arequipe; las fresas con helado de chocolate"
);
assert(
  requiredOptionsAnswer?.nextExpected === "confirmacion",
  "after required options and delivery data are complete, bot should continue to confirmation"
);
const readyForPaymentProof = service.getOrderReviewReadiness(requiredOptionsConversation.id);
assert(
  !readyForPaymentProof.missingFields.includes("opciones_obligatorias"),
  "required options should be resolved from customer answer"
);
const requiredOptionsSummary = service.buildConfirmationSummary(requiredOptionsConversation.id);
assert(
  String(requiredOptionsSummary).includes("fruta: Fresa") &&
    String(requiredOptionsSummary).includes("sabor de helado: Vainilla") &&
    String(requiredOptionsSummary).includes("sabor de helado: Chocolate") &&
    String(requiredOptionsSummary).includes("salsa: Arequipe"),
  "summary should include selected required options for waffles and strawberries"
);

const waffleVariantConversation = service.getOrCreateActiveConversation(
  "telegram",
  "waffle-variant-before-options-test"
);
service.updateConversationState(waffleVariantConversation.id, {
  customerMessage: "te voy a pedir 3 waffles y unas fresas tradicionales con helado",
  items: [
    { producto: "Waffle Tradicional", cantidad: 3, precio_unitario: 15000 }
  ],
  modalidad_entrega: "domicilio"
});
const waffleVariantQuestion = service.buildNextOrderStepReply(waffleVariantConversation.id);
assert(
  waffleVariantQuestion?.source === "backend_waffle_variant_guardrail",
  "generic waffle quantity should ask how many are traditional or chocolate before options"
);
assert(
  String(waffleVariantQuestion?.responseText).includes("3 waffles") &&
    String(waffleVariantQuestion?.responseText).includes("tradicionales") &&
    String(waffleVariantQuestion?.responseText).includes("chocolate"),
  "waffle variant question should mention total and both variants"
);
const waffleVariantAnswer = service.handleRequiredOptionsTurn(
  waffleVariantConversation.id,
  "dos tradicionales y 1 chocolate"
);
assert(
  waffleVariantAnswer?.source === "backend_required_options_guardrail",
  "after waffle variant split, bot should ask required options"
);
assert(
  String(waffleVariantAnswer?.responseText).includes("2 x Waffle Tradicional") &&
    String(waffleVariantAnswer?.responseText).includes("1 x Waffle Chocolate") &&
    String(waffleVariantAnswer?.responseText).includes("1 x Fresas con helado"),
  "required options prompt should reflect split waffle variants"
);

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

const noAfterAddMoreChatId = "payment-no-after-add-more-test";
const noAfterAddMoreConversation = service.startNewConversation("telegram", noAfterAddMoreChatId);
service.updateConversationState(noAfterAddMoreConversation.id, {
  items: [
    {
      producto: "Fresas con crema tradicional",
      cantidad: 1
    }
  ],
  nombre: "Juan Pepito",
  direccion: "Cra 39A #41-99",
  barrio: "Miramar",
  referencia: "Casa",
  metodo_pago: "Nequi",
  modalidad_entrega: "domicilio",
  botMessage: "Perfecto, guardé: Nombre: Juan Pepito, Referencia: casa, Método de pago: nequi. ¿Algo más?",
  mensaje_cliente: "Perfecto, guardé: Nombre: Juan Pepito, Referencia: casa, Método de pago: nequi. ¿Algo más?"
});
const noAfterAddMoreTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: noAfterAddMoreChatId,
  text: "no"
});
assert(
  noAfterAddMoreTurn.source === "backend_payment_instructions",
  "no after add-more question should advance to backend payment instructions"
);
assert(
  String(noAfterAddMoreTurn.responseText).includes("Nequi: 3000000000"),
  "no after add-more should include Nequi account"
);
assert(
  String(noAfterAddMoreTurn.responseText).includes("Total: $21,000"),
  "no after add-more should include total"
);
assert(
  String(noAfterAddMoreTurn.responseText).toLowerCase().includes("comprobante"),
  "no after add-more should ask for payment proof"
);
assert(!noAfterAddMoreTurn.orderId, "no after add-more should not create review order before proof");

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
  String(confirmedTurn.responseText).includes("Total: $21,000"),
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
assert(
  String(offTopicTurn.responseText).includes("Nequi: 3000000000"),
  "off-topic response should keep payment instructions visible"
);
assert(
  String(offTopicTurn.responseText).includes("Total: $21,000"),
  "off-topic response should keep total visible"
);
assert(!offTopicTurn.orderId, "off-topic message should not create review order");

const proofTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: turnChatId,
  text: "comprobante Nequi exitoso por 21000 referencia 12345"
});
assert(
  proofTurn.source === "backend_payment_proof_received",
  "payment proof should be handled by backend before Flowise"
);
assert(proofTurn.orderId, "payment proof should create review order");
assert(
  String(proofTurn.responseText).includes("Comprobante recibido"),
  "payment proof response should acknowledge proof"
);

const imageProofChatId = "payment-image-proof-test";
const imageProofConversation = service.startNewConversation("telegram", imageProofChatId);
service.updateConversationState(imageProofConversation.id, {
  items: [
    {
      producto: "Fresas con crema tradicional",
      cantidad: 1
    }
  ],
  nombre: "Image Proof Test",
  direccion: "Cra 39A #41-99",
  barrio: "Cabecera del Llano",
  referencia: "Porteria",
  metodo_pago: "Nequi",
  modalidad_entrega: "domicilio",
  comprobante_pago_pendiente: true,
  next_expected: "comprobante_pago"
});
const imageProofTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: imageProofChatId,
  text: "comprobante Nequi exitoso por 21000 referencia 12345",
  caption: "comprobante Nequi exitoso por 21000 referencia 12345",
  hasAttachment: true,
  attachmentType: "image",
  attachmentFileId: "telegram-photo-qa"
});
assert(
  imageProofTurn.source === "backend_payment_proof_received",
  "image proof should be handled by backend before Flowise"
);
assert(imageProofTurn.orderId, "image proof should create review order");
assert(
  String(imageProofTurn.responseText).includes("Comprobante recibido"),
  "image proof response should acknowledge proof"
);

const invalidImageProofChatId = "payment-invalid-image-proof-test";
const invalidImageProofConversation = service.startNewConversation("telegram", invalidImageProofChatId);
service.updateConversationState(invalidImageProofConversation.id, {
  items: [
    {
      producto: "Fresas con crema tradicional",
      cantidad: 1
    }
  ],
  nombre: "Invalid Image Proof Test",
  direccion: "Cra 39A #41-99",
  barrio: "Cabecera del Llano",
  referencia: "Porteria",
  metodo_pago: "Nequi",
  modalidad_entrega: "domicilio",
  comprobante_pago_pendiente: true,
  next_expected: "comprobante_pago"
});
const invalidImageProofTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: invalidImageProofChatId,
  text: "",
  hasAttachment: true,
  attachmentType: "image"
});
assert(
  invalidImageProofTurn.source === "backend_waiting_payment_proof",
  "image without proof signals should stay waiting for payment proof"
);
assert(!invalidImageProofTurn.orderId, "invalid image proof should not create review order");
assert(
  String(invalidImageProofTurn.responseText).toLowerCase().includes("validar"),
  "invalid image proof response should explain validation failure"
);

const emptyTelegramProofChatId = "payment-empty-telegram-proof-test";
const emptyTelegramProofConversation = service.startNewConversation("telegram", emptyTelegramProofChatId);
service.updateConversationState(emptyTelegramProofConversation.id, {
  items: [
    {
      producto: "Fresas con crema tradicional",
      cantidad: 1
    }
  ],
  nombre: "Empty Proof Test",
  direccion: "Cra 39A #41-99",
  barrio: "Cabecera del Llano",
  referencia: "Porteria",
  metodo_pago: "Nequi",
  modalidad_entrega: "domicilio",
  comprobante_pago_pendiente: true,
  next_expected: "comprobante_pago"
});
const emptyTelegramProofTurn = await agentFlowTurnService.handleTurn({
  channel: "telegram",
  chatId: emptyTelegramProofChatId,
  text: ""
});
assert(
  emptyTelegramProofTurn.source === "backend_waiting_payment_proof",
  "empty Telegram message while waiting proof should not be treated as proof"
);
assert(!emptyTelegramProofTurn.orderId, "empty Telegram message should not create review order");
assert(
  String(emptyTelegramProofTurn.responseText).toLowerCase().includes("comprobante"),
  "empty Telegram proof response should keep asking for proof"
);

async function assertPaymentMethodInstructions(
  paymentMethod: string,
  expectedLine: string
) {
  const chatId = `payment-method-${paymentMethod.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const conversation = service.startNewConversation("telegram", chatId);
  service.updateConversationState(conversation.id, {
    items: [
      {
        producto: "Fresas con crema tradicional",
        cantidad: 1
      }
    ],
    nombre: "Metodo Pago Test",
    direccion: "Cra 39A #41-99",
    barrio: "Cabecera del Llano",
    referencia: "Porteria",
    metodo_pago: paymentMethod,
    modalidad_entrega: "domicilio"
  });

  const turn = await agentFlowTurnService.handleTurn({
    channel: "telegram",
    chatId,
    text: "si"
  });

  assert(
    turn.source === "backend_payment_instructions",
    `${paymentMethod} should return backend payment instructions`
  );
  assert(
    String(turn.responseText).includes(expectedLine),
    `${paymentMethod} instructions should include ${expectedLine}`
  );
  assert(
    String(turn.responseText).includes("Total: $21,000"),
    `${paymentMethod} instructions should include total`
  );
  assert(!turn.orderId, `${paymentMethod} instructions should not create order yet`);
}

await assertPaymentMethodInstructions("Bancolombia", "Cuenta Bancolombia: 72600000000");
await assertPaymentMethodInstructions("Bre-B", "Llave Bre-B: @test");

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

const conversationService = new ConversationService();
const invalidWhatsAppAttachment = await conversationService.handleIncomingAttachment({
  from: "whatsapp-invalid-proof",
  to: "business",
  attachmentType: "image",
  fileId: "wa-media-invalid",
  mimeType: "image/jpeg"
});
assert(
  invalidWhatsAppAttachment.reply.toLowerCase().includes("todavia no puedo recibir comprobantes"),
  "WhatsApp image before payment proof step should be rejected"
);

const prematureWhatsAppProofAttachment = await conversationService.handleIncomingAttachment({
  from: "whatsapp-premature-proof",
  to: "business",
  attachmentType: "image",
  caption: "comprobante Nequi exitoso por 21000 referencia 12345",
  fileId: "wa-media-valid",
  mimeType: "image/jpeg"
});
assert(
  prematureWhatsAppProofAttachment.reply.toLowerCase().includes("todavia no puedo recibir comprobantes"),
  "WhatsApp image with proof caption should still be rejected before order total"
);

console.log("bot-integration smoke OK");
