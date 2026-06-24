import { writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

process.env.NODE_ENV = "production";
process.env.TELEGRAM_ADMIN_BOT_TOKEN = "";
process.env.TELEGRAM_ADMIN_CHAT_ID = "";

const { ConversationService } = await import("../services/conversation.service.js");
const { demoStore } = await import("../data/demoStore.js");

demoStore.businesses[0]!.status.manualOpenOverride = true;

type Severity = "critical" | "high" | "medium" | "low";
type Probability = "high" | "medium" | "low";
type Category =
  | "Out Of Order"
  | "Delayed Return"
  | "Stale Answer"
  | "Corrections"
  | "Location Chaos"
  | "Product Churn"
  | "Noise And Emoji"
  | "Mixed Intent";

interface ChaosContext {
  scenario: ChaosScenario;
  conversation: typeof demoStore.conversations[number] | undefined;
  order: typeof demoStore.orders[number] | undefined;
  turns: Array<{ customer: string; bot: string; state: string }>;
}

interface ChaosScenario {
  id: string;
  category: Category;
  name: string;
  messages: string[];
  expected: string;
  severityIfFails: Severity;
  probability: Probability;
  validate: (context: ChaosContext) => string[];
}

function currentItems(context: ChaosContext) {
  if (context.conversation?.state !== "pending_human" && context.conversation?.draftOrder?.items.length) {
    return context.conversation.draftOrder.items;
  }

  return context.order?.items ?? context.conversation?.draftOrder?.items ?? [];
}

const checks = {
  hasOrder: (context: ChaosContext) => (context.order ? [] : ["No se creo orden cuando debia crearse."]),
  noOrder: (context: ChaosContext) => (!context.order ? [] : ["Se creo orden cuando debia bloquearse."]),
  state: (state: string) => (context: ChaosContext) =>
    context.conversation?.state === state
      ? []
      : [`Estado ${context.conversation?.state ?? "none"}; esperado ${state}.`],
  itemIncludes: (text: string) => (context: ChaosContext) => {
    const items = currentItems(context);
    return items.some((item) => item.productName.toLowerCase().includes(text.toLowerCase()))
      ? []
      : [`No encontro item '${text}'.`];
  },
  itemNotIncludes: (text: string) => (context: ChaosContext) => {
    const items = currentItems(context);
    return items.some((item) => item.productName.toLowerCase().includes(text.toLowerCase()))
      ? [`No debia conservar item '${text}'.`]
      : [];
  },
  itemCount: (count: number) => (context: ChaosContext) => {
    const items = currentItems(context);
    return items.length === count ? [] : [`Items ${items.length}; esperado ${count}.`];
  },
  name: (name: string) => (context: ChaosContext) =>
    context.order?.customerName === name || context.conversation?.draftOrder?.customerName === name
      ? []
      : [`Nombre '${context.order?.customerName ?? context.conversation?.draftOrder?.customerName ?? "none"}'; esperado '${name}'.`],
  addressIncludes: (text: string) => (context: ChaosContext) => {
    const address = context.order?.address ?? context.conversation?.draftOrder?.address ?? "";
    return address.toLowerCase().includes(text.toLowerCase())
      ? []
      : [`Direccion '${address}' no contiene '${text}'.`];
  },
  addressNotIncludes: (text: string) => (context: ChaosContext) => {
    const address = context.order?.address ?? context.conversation?.draftOrder?.address ?? "";
    return address.toLowerCase().includes(text.toLowerCase())
      ? [`Direccion no debia contener '${text}': '${address}'.`]
      : [];
  },
  zone: (zone: string) => (context: ChaosContext) =>
    context.order?.zoneName === zone ||
    context.conversation?.draftOrder?.inferredZoneId?.toLowerCase().includes(zone.toLowerCase())
      ? []
      : [`Zona '${context.order?.zoneName ?? context.conversation?.draftOrder?.inferredZoneId ?? "none"}'; esperada '${zone}'.`],
  payment: (payment: string) => (context: ChaosContext) =>
    context.order?.paymentMethod === payment || context.conversation?.draftOrder?.paymentMethod === payment
      ? []
      : [`Pago '${context.order?.paymentMethod ?? context.conversation?.draftOrder?.paymentMethod ?? "none"}'; esperado '${payment}'.`],
  total: (total: number) => (context: ChaosContext) =>
    context.order?.pricing.total === total
      ? []
      : [`Total '${context.order?.pricing.total ?? "none"}'; esperado '${total}'.`],
  noCustomOrder: (context: ChaosContext) =>
    context.order?.items.some((item) => item.unitBasePrice === 0)
      ? ["Cerro orden con producto custom/precio por revisar."]
      : [],
  noDuplicateProducts: (context: ChaosContext) => {
    const names = currentItems(context).map(
      (item) => item.productName
    );
    return new Set(names).size === names.length ? [] : [`Productos duplicados: ${names.join(", ")}.`];
  },
  hasAdded: (name: string) => (context: ChaosContext) => {
    const items = currentItems(context);
    return items.some((item) =>
      item.components.some((component) => component.type === "added" && component.name === name)
    )
      ? []
      : [`No encontro adicion '${name}'.`];
  },
  doesNotHaveAdded: (name: string) => (context: ChaosContext) => {
    const items = currentItems(context);
    return items.some((item) =>
      item.components.some((component) => component.type === "added" && component.name === name)
    )
      ? [`Adicion '${name}' quedo aplicada cuando no debia.`]
      : [];
  }
};

function all(...validators: ChaosScenario["validate"][]) {
  return (context: ChaosContext) => validators.flatMap((validator) => validator(context));
}

function scenario(
  id: string,
  category: Category,
  name: string,
  messages: string[],
  expected: string,
  severityIfFails: Severity,
  probability: Probability,
  validate: ChaosScenario["validate"]
): ChaosScenario {
  return {
    id,
    category,
    name,
    messages,
    expected,
    severityIfFails,
    probability,
    validate
  };
}

const scenarios: ChaosScenario[] = [
  scenario("CHAOS-001", "Out Of Order", "Datos completos antes del producto", ["Juan Perez, calle 10 #20-30 Cabecera, Nequi", "quiero una oblea nutella"], "Debe guardar datos tempranos y cerrar al recibir producto.", "critical", "high", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), checks.name("Juan Perez"), checks.zone("Cabecera"), checks.payment("Nequi"), checks.total(13000))),
  scenario("CHAOS-002", "Out Of Order", "Pago primero, producto despues, direccion al final", ["Nequi", "quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera"], "Debe conservar pago suelto y cerrar al completar datos.", "high", "medium", all(checks.hasOrder, checks.payment("Nequi"), checks.itemIncludes("oblea nutella"))),
  scenario("CHAOS-003", "Out Of Order", "Direccion primero y cliente vuelve con pedido", ["calle 10 #20-30 Cabecera", "perdon me demore", "quiero una tradicional", "Juan Perez, Nequi"], "Debe conservar direccion inicial.", "high", "medium", all(checks.hasOrder, checks.itemIncludes("Fresas con crema"), checks.addressIncludes("calle 10"), checks.name("Juan Perez"))),
  scenario("CHAOS-004", "Out Of Order", "Nombre primero, ruido y luego pedido", ["Juan Perez", "?", "estan?", "quiero una malteada fresa", "calle 10 #20-30 Cabecera Nequi"], "Debe conservar nombre suelto.", "medium", "medium", all(checks.hasOrder, checks.name("Juan Perez"), checks.itemIncludes("Malteada"))),
  scenario("CHAOS-005", "Out Of Order", "Notas antes de producto no deben crear orden fantasma", ["sin crema porfa", "perdon aun no dije", "quiero una tradicional", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe aplicar la nota al producto cuando llegue o pedir aclaracion, nunca cerrar sin item.", "medium", "medium", all(checks.hasOrder, checks.itemIncludes("Fresas con crema"), checks.name("Juan Perez"))),

  scenario("CHAOS-006", "Delayed Return", "Cliente desaparece y vuelve con solo pago", ["quiero una oblea nutella", "me fui un rato", "Nequi", "Juan Perez, calle 10 #20-30 Cabecera"], "Debe conservar pedido original.", "medium", "high", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), checks.payment("Nequi"))),
  scenario("CHAOS-007", "Delayed Return", "Cliente vuelve mucho despues cambiando producto", ["quiero una oblea nutella", "perdon estaba trabajando", "mejor una malteada fresa", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe terminar con el ultimo producto.", "high", "high", all(checks.hasOrder, checks.itemIncludes("Malteada"), checks.itemNotIncludes("oblea nutella"), checks.itemCount(1))),
  scenario("CHAOS-008", "Delayed Return", "Cliente vuelve tras menu repetido", ["menu", "menu", "ok gracias", "mas tarde escribo", "quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe iniciar pedido despues del ruido.", "medium", "high", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), checks.name("Juan Perez"))),
  scenario("CHAOS-009", "Delayed Return", "Cliente vuelve despues de pedido en revision con cambio de direccion", ["quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera, Nequi", "perdon acabo de ver", "cambia direccion a carrera 15 #45-12 Provenza"], "Debe actualizar direccion post-revision.", "high", "medium", all(checks.hasOrder, checks.addressIncludes("carrera 15"), checks.zone("Provenza"), checks.total(14000))),
  scenario("CHAOS-010", "Delayed Return", "Cliente vuelve con otro pedido sin /newchat", ["quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera, Nequi", "media hora despues quiero hacer otro pedido", "una malteada fresa"], "Debe abrir nuevo borrador, no mezclar con orden anterior.", "high", "medium", all(checks.itemIncludes("Malteada"), checks.itemCount(1))),

  scenario("CHAOS-011", "Stale Answer", "Si responde a pregunta vieja no debe confirmar nada", ["quiero hacer un pedido", "si"], "Debe seguir pidiendo producto.", "medium", "high", checks.noOrder),
  scenario("CHAOS-012", "Stale Answer", "Ese despues de menu no debe inventar", ["menu", "ese", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe pedir producto exacto.", "medium", "medium", checks.noOrder),
  scenario("CHAOS-013", "Stale Answer", "Normal despues de menu no debe cerrar", ["menu", "normal", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe pedir producto.", "medium", "medium", checks.noOrder),
  scenario("CHAOS-014", "Stale Answer", "Solo emoji despues de pedido no borra item", ["quiero una oblea nutella", "ðŸ‘", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Emoji debe ser ruido inocuo.", "low", "high", all(checks.hasOrder, checks.itemIncludes("oblea nutella"))),
  scenario("CHAOS-015", "Stale Answer", "No despues de haber dado direccion no cancela implicitamente", ["quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera", "no", "Nequi"], "No debe borrar direccion ni producto por un no ambiguo.", "medium", "medium", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), checks.addressIncludes("calle 10"))),

  scenario("CHAOS-016", "Corrections", "Corrige producto tres veces", ["quiero una oblea nutella", "no, tradicional", "no mentira malteada fresa", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe cerrar solo malteada.", "critical", "medium", all(checks.hasOrder, checks.itemIncludes("Malteada"), checks.itemCount(1), checks.itemNotIncludes("oblea nutella"))),
  scenario("CHAOS-017", "Corrections", "Corrige nombre despues de datos", ["quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera, Nequi", "el nombre es Maria Lopez"], "Debe actualizar nombre en orden pendiente.", "high", "medium", all(checks.hasOrder, checks.name("Maria Lopez"))),
  scenario("CHAOS-018", "Corrections", "Corrige pago de Nequi a efectivo", ["quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera, Nequi", "mejor efectivo con 20000"], "Debe actualizar pago post-revision.", "high", "medium", all(checks.hasOrder, checks.payment("Efectivo"))),
  scenario("CHAOS-019", "Corrections", "Corrige de efectivo a Nequi", ["quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera, efectivo con 20000", "no, mejor Nequi"], "Debe actualizar a Nequi y no exigir cambio.", "medium", "medium", all(checks.hasOrder, checks.payment("Nequi"))),
  scenario("CHAOS-020", "Corrections", "Quita topping agregado por error", ["quiero una tradicional con brownie", "ay no sin brownie", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe remover Brownie agregado.", "medium", "medium", all(checks.hasOrder, checks.doesNotHaveAdded("Brownie"))),

  scenario("CHAOS-021", "Location Chaos", "Ubicacion textual y luego direccion escrita", ["quiero una oblea nutella", "te mando ubicacion: Cabecera", "mejor usa calle 10 #20-30 Cabecera", "Juan Perez, Nequi"], "Debe usar direccion escrita final.", "high", "medium", all(checks.hasOrder, checks.addressIncludes("calle 10"), checks.zone("Cabecera"), checks.name("Juan Perez"))),
  scenario("CHAOS-022", "Location Chaos", "Dos ubicaciones antes de cerrar", ["quiero una oblea nutella", "carrera 15 #45-12 Provenza", "no esa no, calle 10 #20-30 Cabecera", "Juan Perez, Nequi"], "Debe usar la ultima direccion.", "high", "medium", all(checks.hasOrder, checks.addressIncludes("calle 10"), checks.addressNotIncludes("carrera 15"), checks.zone("Cabecera"))),
  scenario("CHAOS-023", "Location Chaos", "Ubicacion fuera de cobertura luego zona valida", ["quiero una oblea nutella", "Giron", "no mentiras Cabecera calle 10 #20-30", "Juan Perez, Nequi"], "Debe recuperar con zona valida.", "high", "medium", all(checks.hasOrder, checks.zone("Cabecera"), checks.name("Juan Perez"))),
  scenario("CHAOS-024", "Location Chaos", "Solo referencia no debe cerrar", ["quiero una oblea nutella", "Juan Perez, al frente del parque, Nequi"], "Debe pedir direccion exacta.", "high", "medium", checks.noOrder),
  scenario("CHAOS-025", "Location Chaos", "Direccion con torre corregida", ["quiero una oblea nutella", "Juan Perez, calle 10 #20-30 torre 1 Cabecera, Nequi", "mejor torre 2"], "Debe actualizar referencia post-revision o dejar cambio visible.", "medium", "low", all(checks.hasOrder, checks.addressIncludes("torre 2"))),

  scenario("CHAOS-026", "Product Churn", "Cliente cambia y agrega producto", ["quiero una oblea nutella", "mejor una tradicional", "y tambien una malteada fresa", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe tener tradicional y malteada, no oblea.", "high", "medium", all(checks.hasOrder, checks.itemCount(2), checks.itemIncludes("Fresas con crema"), checks.itemIncludes("Malteada"), checks.itemNotIncludes("oblea nutella"))),
  scenario("CHAOS-027", "Product Churn", "Cliente pide dos, luego una, luego otra", ["quiero dos obleas de nutella", "no una sola", "y agrega una malteada fresa", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe evitar duplicados raros y conservar dos items logicos.", "high", "medium", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), checks.itemIncludes("Malteada"), checks.noDuplicateProducts)),
  scenario("CHAOS-028", "Product Churn", "Producto inexistente entre cambios no contamina pedido", ["quiero sushi de fresa", "no mentiras una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe ignorar inexistente y cerrar oblea.", "high", "medium", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), checks.noCustomOrder)),
  scenario("CHAOS-029", "Product Churn", "Cliente pide menu en mitad de cambio", ["quiero una oblea nutella", "menu", "no esa, una malteada fresa", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe terminar en malteada.", "medium", "medium", all(checks.hasOrder, checks.itemIncludes("Malteada"), checks.itemNotIncludes("oblea nutella"))),
  scenario("CHAOS-030", "Product Churn", "Cliente cancela y cambia sin palabra nuevo", ["quiero una oblea nutella", "cancelar", "malteada fresa", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe permitir nuevo pedido por producto directo.", "high", "medium", all(checks.hasOrder, checks.itemIncludes("Malteada"), checks.itemNotIncludes("oblea nutella"))),

  scenario("CHAOS-031", "Noise And Emoji", "Mensajes basura entre datos", ["quiero una oblea nutella", "jajajaja", "ðŸ¤·â€â™‚ï¸", "Juan Perez", "no se", "calle 10 #20-30 Cabecera", "Nequi"], "Debe ignorar ruido y cerrar.", "medium", "high", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), checks.name("Juan Perez"))),
  scenario("CHAOS-032", "Noise And Emoji", "Solo stickers no deben resetear", ["quiero una tradicional", "[sticker]", "[foto]", "con brownie", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe conservar producto y aplicar brownie.", "medium", "medium", all(checks.hasOrder, checks.itemIncludes("Fresas con crema"), checks.hasAdded("Brownie"))),
  scenario("CHAOS-033", "Noise And Emoji", "Texto con emojis mezclados", ["holaaa ðŸ“ quiero una oblea nutella ðŸ˜­", "Juan Perez ðŸ«¶ calle 10 #20-30 Cabecera pago Nequi"], "Debe extraer pedido pese a emojis.", "medium", "medium", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), checks.zone("Cabecera"))),
  scenario("CHAOS-034", "Noise And Emoji", "Cliente impaciente insulta y luego da datos", ["OBLEA NUTELLA YA PORFA", "???", "RESPONDE", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe mantener contexto.", "medium", "medium", all(checks.hasOrder, checks.itemIncludes("oblea nutella"))),
  scenario("CHAOS-035", "Noise And Emoji", "Audio transcrito con muletillas", ["ehhh mira seria una oblea nutella como pues normal", "mmm", "Juan Perez calle 10 #20-30 Cabecera pago Nequi"], "Debe cerrar oblea normal.", "medium", "medium", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), checks.zone("Cabecera"))),

  scenario("CHAOS-036", "Mixed Intent", "Pregunta menu y pedido en un mensaje", ["que tienen? quiero una oblea nutella de una vez", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe priorizar pedido sin mandar solo menu.", "high", "high", all(checks.hasOrder, checks.itemIncludes("oblea nutella"))),
  scenario("CHAOS-037", "Mixed Intent", "Pregunta horario y da pedido completo", ["estan abiertos? quiero una malteada fresa para Juan Perez calle 10 #20-30 Cabecera Nequi"], "Debe extraer pedido completo.", "high", "medium", all(checks.hasOrder, checks.itemIncludes("Malteada"), checks.name("Juan Perez"))),
  scenario("CHAOS-038", "Mixed Intent", "Pregunta pagos y ya elige pago", ["reciben nequi? quiero una oblea nutella para Juan Perez calle 10 #20-30 Cabecera pago Nequi"], "Debe tomar pedido.", "high", "high", all(checks.hasOrder, checks.payment("Nequi"), checks.itemIncludes("oblea nutella"))),
  scenario("CHAOS-039", "Mixed Intent", "Pregunta domicilio gratis con pedido", ["cuanto vale domicilio? quiero una oblea nutella a Cabecera Juan Perez calle 10 #20-30 Nequi"], "Debe cobrar domicilio real.", "critical", "medium", all(checks.hasOrder, checks.total(13000))),
  scenario("CHAOS-040", "Mixed Intent", "Pregunta recomendacion pero ya pide", ["que recomiendas? igual mandame una tradicional con milo Juan Perez calle 10 #20-30 Cabecera Nequi"], "Debe tomar pedido explicito.", "high", "medium", all(checks.hasOrder, checks.itemIncludes("Fresas con crema"), checks.hasAdded("Milo"))),

  scenario("CHAOS-041", "Out Of Order", "Cliente da datos partidos y producto al final", ["Juan", "Perez", "calle 10 #20-30", "Cabecera", "Nequi", "una oblea nutella"], "Debe ensamblar datos suficientes.", "high", "medium", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), checks.zone("Cabecera"), checks.payment("Nequi"))),
  scenario("CHAOS-042", "Corrections", "Nombre partido corregido", ["quiero una oblea nutella", "Juan", "no, Juan Perez", "calle 10 #20-30 Cabecera", "Nequi"], "Debe usar nombre completo.", "medium", "medium", all(checks.hasOrder, checks.name("Juan Perez"))),
  scenario("CHAOS-043", "Location Chaos", "Direccion post-revision cambia a pickup", ["quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera, Nequi", "mejor paso a recoger"], "Debe cambiar a pickup y total sin domicilio.", "high", "low", all(checks.hasOrder, checks.total(8000))),
  scenario("CHAOS-044", "Product Churn", "Cliente agrega item post-revision y luego cancela segundo", ["quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera, Nequi", "agrega una malteada fresa", "no, la malteada no"], "Debe no dejar malteada activa.", "high", "medium", all(checks.hasOrder, checks.itemNotIncludes("Malteada"))),
  scenario("CHAOS-045", "Stale Answer", "Cliente dice ese tras producto activo", ["quiero una oblea nutella", "ese", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe conservar oblea, no duplicar ni inventar.", "low", "medium", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), checks.itemCount(1))),
  scenario("CHAOS-046", "Mixed Intent", "Cliente mezcla queja con pedido", ["ayer se demoraron pero quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe no perder venta por queja.", "medium", "medium", all(checks.hasOrder, checks.itemIncludes("oblea nutella"))),
  scenario("CHAOS-047", "Noise And Emoji", "Cliente envia signos antes de producto", ["????", "hola???", "una oblea nutella", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe iniciar pedido cuando aparezca producto.", "low", "high", all(checks.hasOrder, checks.itemIncludes("oblea nutella"))),
  scenario("CHAOS-048", "Corrections", "Cliente corrige barrio sin repetir direccion", ["quiero una oblea nutella", "Juan Perez, calle 10 #20-30 Provenza, Nequi", "perdon es Cabecera"], "Debe actualizar zona a Cabecera.", "high", "medium", all(checks.hasOrder, checks.zone("Cabecera"), checks.total(13000))),
  scenario("CHAOS-049", "Product Churn", "Cliente cambia cantidad en texto natural", ["quiero dos obleas de nutella", "mejor solo una", "Juan Perez, calle 10 #20-30 Cabecera, Nequi"], "Debe cerrar una oblea nutella.", "high", "medium", all(checks.hasOrder, checks.itemIncludes("oblea nutella"), (context) => (context.order?.items[0]?.quantity === 1 ? [] : [`Cantidad ${context.order?.items[0]?.quantity ?? "none"}; esperada 1.`]))),
  scenario("CHAOS-050", "Mixed Intent", "Cliente manda pedido completo con referencia familiar", ["es para mi hermana Maria Lopez, quiero una oblea nutella, direccion calle 10 #20-30 Cabecera, pago Nequi"], "Debe guardar nombre real Maria Lopez, no 'mi hermana'.", "medium", "medium", all(checks.hasOrder, checks.name("Maria Lopez"), checks.itemIncludes("oblea nutella")))
];

if (scenarios.length !== 50) {
  throw new Error(`Expected 50 chaos scenarios, got ${scenarios.length}`);
}

async function runScenario(scenarioToRun: ChaosScenario) {
  const service = new ConversationService();
  const phone = `chaos_${scenarioToRun.id}`;
  const turns: ChaosContext["turns"] = [];

  for (const text of scenarioToRun.messages) {
    const result = await service.handleIncomingMessage({ from: phone, to: "qa-business", text });
    turns.push({ customer: text, bot: result.reply, state: result.state });
  }

  const conversation = demoStore.conversations.find((entry) => entry.customerPhone === phone);
  const order = demoStore.orders.find((entry) => entry.customerPhone === phone);
  const context: ChaosContext = { scenario: scenarioToRun, conversation, order, turns };
  const failures = scenarioToRun.validate(context);
  const items = currentItems({ scenario: scenarioToRun, conversation, order, turns });

  return {
    id: scenarioToRun.id,
    category: scenarioToRun.category,
    name: scenarioToRun.name,
    expected: scenarioToRun.expected,
    failed: failures.length > 0,
    failures,
    severityIfFails: scenarioToRun.severityIfFails,
    probability: scenarioToRun.probability,
    finalState: conversation?.state ?? null,
    orderCreated: Boolean(order),
    orderStatus: order?.status ?? null,
    orderTotal: order?.pricing.total ?? null,
    customerName: order?.customerName ?? conversation?.draftOrder?.customerName ?? null,
    address: order?.address ?? conversation?.draftOrder?.address ?? null,
    paymentMethod: order?.paymentMethod ?? conversation?.draftOrder?.paymentMethod ?? null,
    itemSummary: items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitBasePrice: item.unitBasePrice,
      additions: item.components.filter((component) => component.type === "added").map((component) => component.name),
      removals: item.components.filter((component) => component.type === "removed").map((component) => component.name)
    })),
    lastBotReply: turns.at(-1)?.bot ?? null,
    turns
  };
}

const startedAt = new Date().toISOString();
const results = [];

for (const entry of scenarios) {
  results.push(await runScenario(entry));
}

const failed = results.filter((result) => result.failed);
const bySeverity = failed.reduce<Record<Severity, number>>(
  (acc, result) => {
    acc[result.severityIfFails] += 1;
    return acc;
  },
  { critical: 0, high: 0, medium: 0, low: 0 }
);
const byCategory = results.reduce<Record<Category, { total: number; failed: number }>>(
  (acc, result) => {
    acc[result.category] ??= { total: 0, failed: 0 };
    acc[result.category].total += 1;
    if (result.failed) {
      acc[result.category].failed += 1;
    }
    return acc;
  },
  {} as Record<Category, { total: number; failed: number }>
);

const report = {
  startedAt,
  finishedAt: new Date().toISOString(),
  totalScenarios: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failedBySeverity: bySeverity,
  failedByCategory: byCategory,
  highOrCritical: failed.filter((result) => ["critical", "high"].includes(result.severityIfFails)),
  results
};

const outputPath = resolve("qa-output", "chaos-conversations-report.json");
await mkdir(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify(report, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}

