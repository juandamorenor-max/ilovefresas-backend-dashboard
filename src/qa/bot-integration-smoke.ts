import { demoStore } from "../data/demoStore.js";
import { BotIntegrationService } from "../services/bot-integration.service.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

demoStore.conversations = [];
demoStore.messages = [];
demoStore.orders = [];

const service = new BotIntegrationService();

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

const ready = service.getOrderReviewReadiness(first.id);
assert(ready.ready, `complete order should be ready, missing: ${ready.missingFields.join(", ")}`);

const order = service.createOrderForReview(first.id);
assert(order, "complete order should create review order");
assert(order.status === "pending_review", "created order should be pending_review");
assert(order.pricing.deliveryFee === 5000, "default delivery fee should be 5000");
assert(order.pricing.total === 23000, "total should include item, topping and delivery fee");

const second = service.startNewConversation("telegram", "531515729");
assert(second.id !== first.id, "/newchat should create a different conversation");
assert(second.conversationState.items === "[]", "/newchat should reset items");

console.log("bot-integration smoke OK");
