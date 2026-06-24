const $ = (id) => document.getElementById(id);

const state = {
  role: "operator",
  view: "operation",
  orders: [],
  conversations: [],
  products: [],
  modifiers: [],
  paymentMethods: [],
  botCatalog: null,
  businessStatus: {},
  integrationStatus: null,
  selectedOrderId: null,
  selectedConversationId: null,
  search: "",
  orderStatusFilter: "",
  availabilitySearch: "",
  pollingId: null
};

const demoData = {
  orders: [
    {
      id: "demo_order_1",
      displayNumber: 1,
      customer: "Cliente demo",
      phone: "telegram:531515729",
      channel: "Telegram",
      address: "Cra 39A # 41-99",
      zone: "Cabecera del Llano",
      addressReference: "Casa blanca",
      payment: "Nequi",
      subtotal: 16000,
      delivery: 5000,
      total: 21000,
      status: "pending",
      risk: "Revision",
      urgent: true,
      age: "Ahora",
      note: "Pedido demo creado para probar el panel.",
      items: ["Fresas con crema tradicional x1"],
      lineItems: [
        {
          productName: "Fresas con crema tradicional",
          quantity: 1,
          unitBasePrice: 16000,
          baseTotal: 16000,
          total: 16000,
          additions: [],
          removals: [],
          selectedOptions: [],
          notes: null,
          priceStatus: "priced"
        }
      ],
      dispatchNotified: false
    }
  ],
  conversations: [
    {
      id: "demo_conversation_1",
      name: "Cliente demo",
      meta: "telegram:531515729 - Telegram",
      state: "Pedido en revision",
      human: true,
      last: "Listo, ese es mi pedido",
      orderId: "demo_order_1",
      messages: [
        ["user", "Hola, quiero unas fresas tradicionales"],
        ["bot", "Perfecto. Para domicilio me compartes tus datos?"],
        ["user", "Cabecera del Llano, Cra 39A # 41-99"]
      ]
    }
  ],
  products: [
    {
      id: "demo_product_1",
      name: "Fresas con crema tradicional",
      category: "Fresas",
      price: 16000,
      isActive: true,
      isOutOfStock: false
    }
  ],
  paymentMethods: [
    {
      id: "pm_nequi",
      name: "Nequi",
      accountLabel: "Nequi",
      accountValue: "3000000000",
      requiresProof: true,
      isActive: true
    },
    {
      id: "pm_bancolombia",
      name: "Bancolombia",
      accountLabel: "Cuenta Bancolombia",
      accountValue: "72600000000",
      requiresProof: true,
      isActive: true
    },
    {
      id: "pm_bre_b",
      name: "Bre-B",
      accountLabel: "Llave Bre-B",
      accountValue: "@test",
      requiresProof: true,
      isActive: true
    }
  ],
  modifiers: [
    { id: "demo_modifier_1", name: "Oreo", price: 2500, isActive: true },
    { id: "demo_modifier_2", name: "Arequipe", price: 2000, isActive: true }
  ],
  botCatalog: {
    productos: [{ id: "demo_product_1", name: "Fresas con crema tradicional", price: 16000 }],
    toppings: [{ id: "demo_modifier_1", name: "Oreo", price: 2500 }],
    adiciones: [{ id: "demo_modifier_2", name: "Arequipe", price: 2000 }],
    agotados: { productos: [], modificadores: [] }
  },
  businessStatus: { botPausedUntil: null },
  integrationStatus: {
    storage: { configured: true, mode: "demo", writable: true },
    flowise: { configured: false },
    botIntegration: { secretEnabled: true },
    timestamp: new Date().toISOString()
  }
};

const titles = {
  operation: ["Operacion", "Pedidos y chats reales del backend"],
  conversations: ["Conversaciones", "Respuesta manual y pausa por chat"],
  orders: ["Pedidos", "Flujo operativo de cocina y despacho"],
  detail: ["Detalle del pedido", "Validacion y acciones del operario"],
  availability: ["Disponibilidad", "Productos y adiciones que el bot puede ofrecer"],
  catalog: ["Catalogo y pagos", "Edicion de productos, toppings y datos de transferencia"]
};

const statusLabels = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "Preparando",
  dispatched: "Enviado",
  completed: "Completado",
  cancelled: "Cancelado"
};

const statusColumns = ["pending", "confirmed", "preparing", "dispatched", "completed", "cancelled"];

const nextStatuses = {
  pending: ["cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["dispatched", "cancelled"],
  dispatched: ["completed"],
  completed: [],
  cancelled: []
};

const adminApi = {
  listOrders: () => apiFetch("/admin/dashboard/orders"),
  listConversations: () => apiFetch("/admin/dashboard/conversations"),
  listProducts: () => apiFetch("/admin/dashboard/products"),
  listModifiers: () => apiFetch("/admin/dashboard/modifiers"),
  getBotCatalog: () => apiFetch("/admin/dashboard/bot-catalog"),
  listPaymentMethods: () => apiFetch("/admin/dashboard/payment-methods"),
  getBusinessStatus: () => apiFetch("/admin/dashboard/business-status"),
  getIntegrationStatus: () => apiFetch("/health/integration"),
  updateOrder: (order, patch) => apiFetch(`/admin/dashboard/orders/${encodeURIComponent(order.id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  }),
  updateOrderStatus: (order, status) => apiFetch(`/admin/dashboard/orders/${encodeURIComponent(order.id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  }),
  confirmOrderAndNotify: (order, patch) => apiFetch(`/admin/dashboard/orders/${encodeURIComponent(order.id)}/confirm-and-notify`, {
    method: "POST",
    body: JSON.stringify(patch)
  }),
  notifyDispatched: (order) => apiFetch(`/admin/dashboard/orders/${encodeURIComponent(order.id)}/notify-dispatched`, {
    method: "POST",
    body: JSON.stringify({})
  }),
  sendConversationMessage: (conversation, text) => apiFetch(`/admin/dashboard/conversations/${encodeURIComponent(conversation.id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text })
  }),
  setConversationBotPause: (conversation, patch) => apiFetch(`/admin/dashboard/conversations/${encodeURIComponent(conversation.id)}/bot-pause`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  }),
  setGlobalBotPause: (patch) => apiFetch("/admin/dashboard/bot-pause", {
    method: "PATCH",
    body: JSON.stringify(patch)
  }),
  updateProductAvailability: (product, patch) => apiFetch(`/admin/products/${encodeURIComponent(product.id)}/availability`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  }),
  updateModifierAvailability: (modifier, patch) => apiFetch(`/admin/modifiers/${encodeURIComponent(modifier.id)}/availability`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  }),
  createProduct: (payload) => apiFetch("/admin/products", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  updateProduct: (product, patch) => apiFetch(`/admin/products/${encodeURIComponent(product.id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  }),
  createModifier: (payload) => apiFetch("/admin/modifiers", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  updateModifier: (modifier, patch) => apiFetch(`/admin/modifiers/${encodeURIComponent(modifier.id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  }),
  updatePaymentMethod: (method, patch) => apiFetch(`/admin/payment-methods/${encodeURIComponent(method.id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  })
};

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function isDemoMode() {
  return state.role === "demo";
}

function isAdminRole() {
  return state.role === "admin" || state.role === "demo";
}

function money(value) {
  return Number(value || 0).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseMoney(value) {
  return Number(String(value ?? "").replace(/[^\d]/g, "") || 0);
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function replaceById(collection, item) {
  const index = collection.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    collection[index] = item;
  } else {
    collection.unshift(item);
  }
  return item;
}

async function enterDashboard() {
  state.role = $("roleSelect").value;
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("demoBanner").classList.toggle("hidden", !isDemoMode());
  $("roleBadge").textContent = state.role === "admin" ? "Admin" : state.role === "demo" ? "Demo" : "Operario";
  document.body.classList.toggle("is-admin", isAdminRole());
  document.body.classList.toggle("is-demo", isDemoMode());
  document.querySelectorAll("[data-admin-only]").forEach((element) => {
    element.classList.toggle("hidden", !isAdminRole());
  });

  stopPolling();
  if (isDemoMode()) {
    loadDemoData();
    renderAll();
    return;
  }

  clearData();
  renderAll();
  await refreshData({ quiet: false });
  startPolling();
}

function loadDemoData() {
  state.orders = structuredClone(demoData.orders);
  state.conversations = structuredClone(demoData.conversations);
  state.products = structuredClone(demoData.products);
  state.modifiers = structuredClone(demoData.modifiers);
  state.paymentMethods = structuredClone(demoData.paymentMethods);
  state.botCatalog = structuredClone(demoData.botCatalog);
  state.businessStatus = structuredClone(demoData.businessStatus);
  state.integrationStatus = structuredClone(demoData.integrationStatus);
  state.selectedOrderId = state.orders[0]?.id ?? null;
  state.selectedConversationId = state.conversations[0]?.id ?? null;
}

function clearData() {
  state.orders = [];
  state.conversations = [];
  state.products = [];
  state.modifiers = [];
  state.paymentMethods = [];
  state.botCatalog = null;
  state.businessStatus = {};
  state.integrationStatus = null;
  state.selectedOrderId = null;
  state.selectedConversationId = null;
}

async function refreshData({ quiet = true } = {}) {
  if (isDemoMode()) {
    renderAll();
    return;
  }
  try {
    const [orders, conversations, products, modifiers, botCatalog, paymentMethods, businessStatus, integrationStatus] = await Promise.all([
      adminApi.listOrders(),
      adminApi.listConversations(),
      adminApi.listProducts(),
      adminApi.listModifiers(),
      adminApi.getBotCatalog(),
      adminApi.listPaymentMethods(),
      adminApi.getBusinessStatus(),
      adminApi.getIntegrationStatus()
    ]);
    state.orders = Array.isArray(orders) ? orders : [];
    state.conversations = Array.isArray(conversations) ? conversations : [];
    state.products = Array.isArray(products) ? products.map(adaptProduct) : [];
    state.modifiers = Array.isArray(modifiers) ? modifiers.map(adaptModifier) : [];
    state.botCatalog = botCatalog || null;
    state.paymentMethods = Array.isArray(paymentMethods) ? paymentMethods : [];
    state.businessStatus = businessStatus || {};
    state.integrationStatus = integrationStatus || null;
    state.selectedOrderId = state.orders.some((order) => order.id === state.selectedOrderId)
      ? state.selectedOrderId
      : state.orders[0]?.id ?? null;
    state.selectedConversationId = state.conversations.some((conversation) => conversation.id === state.selectedConversationId)
      ? state.selectedConversationId
      : state.conversations[0]?.id ?? null;
    renderAll();
    if (!quiet) showToast("Datos sincronizados.");
  } catch (error) {
    console.error(error);
    showToast("No pude cargar datos reales del backend.");
  }
}

function adaptProduct(product) {
  return {
    ...product,
    price: Number(product.price ?? product.basePrice ?? 0),
    isActive: product.isActive !== false,
    isOutOfStock: Boolean(product.isOutOfStock),
    availabilityStatus: product.availabilityStatus || (product.isOutOfStock ? "out_of_stock" : "available")
  };
}

function adaptModifier(modifier) {
  return {
    ...modifier,
    price: Number(modifier.price ?? modifier.priceDelta ?? 0),
    isActive: modifier.isActive !== false
  };
}

function startPolling() {
  stopPolling();
  state.pollingId = window.setInterval(() => refreshData({ quiet: true }), 8000);
}

function stopPolling() {
  if (state.pollingId) {
    window.clearInterval(state.pollingId);
    state.pollingId = null;
  }
}

function setView(view) {
  if (view === "catalog" && !isAdminRole()) {
    showToast("Catalogo esta disponible solo para Admin.");
    return;
  }
  state.view = view;
  document.querySelectorAll(".view").forEach((element) => element.classList.toggle("active", element.id === view));
  document.querySelectorAll(".nav button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("viewTitle").textContent = titles[view]?.[0] ?? "Dashboard";
  $("viewSubtitle").textContent = titles[view]?.[1] ?? "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectedOrder() {
  return state.orders.find((order) => order.id === state.selectedOrderId) ?? null;
}

function selectedConversation() {
  return state.conversations.find((conversation) => conversation.id === state.selectedConversationId) ?? null;
}

function filteredOrders() {
  const query = normalize(state.search);
  return state.orders.filter((order) => {
    const matchesStatus = !state.orderStatusFilter || order.status === state.orderStatusFilter;
    const haystack = normalize([
      order.id,
      order.displayNumber,
      order.customer,
      order.phone,
      order.channel,
      order.address,
      order.zone,
      order.payment,
      order.status,
      order.risk,
      ...(order.items || [])
    ].join(" "));
    return matchesStatus && (!query || haystack.includes(query));
  });
}

function getStats() {
  const byStatus = Object.fromEntries(statusColumns.map((status) => [status, 0]));
  state.orders.forEach((order) => {
    byStatus[order.status] = (byStatus[order.status] || 0) + 1;
  });
  return {
    byStatus,
    humanChats: state.conversations.filter((conversation) => conversation.human).length
  };
}

function renderAll() {
  renderShell();
  renderOperation();
  renderOrders();
  renderDetail();
  renderConversations();
  renderAvailability();
  renderCatalog();
}

function renderShell() {
  const paused = isPauseActive(state.businessStatus?.botPausedUntil);
  $("botStatusLabel").textContent = paused ? "Pausado" : "Activo";
  $("globalBotToggle").textContent = paused ? "Reactivar bot" : "Pausar bot";
}

function renderOperation() {
  const stats = getStats();
  $("metricPending").textContent = stats.byStatus.pending;
  $("metricConfirmed").textContent = stats.byStatus.confirmed;
  $("metricPreparing").textContent = stats.byStatus.preparing;
  $("metricDispatched").textContent = stats.byStatus.dispatched;
  $("metricHumanChats").textContent = stats.humanChats;
  renderSystemStatus();

  const actionOrders = state.orders.filter((order) =>
    order.status === "pending" || order.urgent || (order.risk && order.risk !== "Bajo")
  );
  $("operationOrdersCount").textContent = actionOrders.length;
  $("operationOrders").innerHTML = actionOrders.length
    ? actionOrders.map(orderCard).join("")
    : emptyState("Sin pedidos pendientes de accion.");

  const kitchenOrders = state.orders.filter((order) => ["confirmed", "preparing"].includes(order.status));
  $("kitchenCount").textContent = kitchenOrders.length;
  $("kitchenQueue").innerHTML = kitchenOrders.length
    ? kitchenOrders.map(orderCard).join("")
    : emptyState("La cocina no tiene pedidos en cola.");
}

function renderSystemStatus() {
  const integration = state.integrationStatus;
  if (!integration) {
    $("systemUpdatedAt").textContent = "Sin sincronizar";
    $("systemStatus").innerHTML = emptyState("No se pudo leer el estado de integracion.");
    return;
  }

  const storage = integration.storage || {};
  const flowise = integration.flowise || {};
  const botIntegration = integration.botIntegration || {};
  $("systemUpdatedAt").textContent = integration.timestamp
    ? `Actualizado ${new Date(integration.timestamp).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
    : "Actualizado";

  const storageOk = storage.mode === "snapshot-json" && storage.configured && storage.writable;
  const storageLabel = storage.mode === "demo"
    ? "Demo"
    : storageOk
      ? "Persistente"
      : "Memoria";
  const storageDetail = storageOk
    ? `Snapshot activo${storage.path ? ` en ${storage.path}` : ""}`
    : storage.mode === "demo"
      ? "Datos falsos separados"
      : "Configura RUNTIME_STORE_PATH y Volume en Railway";

  const items = [
    {
      label: "Datos",
      value: storageLabel,
      detail: storageDetail,
      status: storageOk || storage.mode === "demo" ? "ok" : "warn"
    },
    {
      label: "Flowise",
      value: flowise.configured ? "Conectado" : "Sin flow id",
      detail: flowise.configured ? "Agentflow configurado" : "El bridge no puede llamar Flowise",
      status: flowise.configured ? "ok" : "warn"
    },
    {
      label: "Bot API",
      value: botIntegration.secretEnabled ? "Protegida" : "Sin secreto",
      detail: botIntegration.secretEnabled ? "x-bot-secret activo" : "Configura BOT_INTEGRATION_SECRET",
      status: botIntegration.secretEnabled ? "ok" : "warn"
    }
  ];

  $("systemStatus").innerHTML = items.map((item) => `
    <article class="system-item ${item.status}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.detail)}</small>
    </article>
  `).join("");
}

function renderOrders() {
  $("orderFilters").innerHTML = [
    `<button class="chip ${state.orderStatusFilter === "" ? "active" : ""}" data-filter-status="">Todos</button>`,
    ...statusColumns.map((status) =>
      `<button class="chip ${state.orderStatusFilter === status ? "active" : ""}" data-filter-status="${status}">${statusLabels[status]}</button>`
    )
  ].join("");

  const orders = filteredOrders();
  $("ordersBoard").innerHTML = statusColumns.map((status) => {
    const columnOrders = orders.filter((order) => order.status === status);
    return `
      <article class="order-column">
        <header>${statusLabels[status]} <span>${columnOrders.length}</span></header>
        <div class="list">${columnOrders.length ? columnOrders.map(orderCard).join("") : emptyState("Sin pedidos")}</div>
      </article>
    `;
  }).join("");
}

function orderCard(order) {
  return `
    <button class="order-card" data-order-id="${escapeAttr(order.id)}">
      <strong>${escapeHtml(orderLabel(order))}</strong>
      <span>${escapeHtml(order.customer || "Cliente pendiente")}</span>
      <small>${escapeHtml(order.zone || "Zona pendiente")} - ${escapeHtml(order.payment || "Pago pendiente")}</small>
      <small>${escapeHtml(order.paymentStatusLabel || paymentStatusLabel(order))}</small>
      <div class="card-bottom">
        <span class="chip ${escapeAttr(order.status)}">${escapeHtml(statusLabels[order.status] || order.status)}</span>
        <b>${money(order.total)}</b>
      </div>
    </button>
  `;
}

function renderDetail() {
  const order = selectedOrder();
  if (!order) {
    $("detailTitle").textContent = "Sin pedido seleccionado";
    $("detailCustomer").textContent = "";
    $("detailStatus").textContent = "";
    $("detailItems").innerHTML = emptyState("Selecciona un pedido para ver el detalle.");
    $("detailSubtotal").textContent = money(0);
    $("detailDelivery").textContent = money(0);
    $("detailTotal").textContent = money(0);
    $("editAddress").value = "";
    $("editPayment").value = "";
    $("editDeliveryFee").value = "";
    $("editNote").value = "";
    return;
  }

  $("detailTitle").textContent = orderLabel(order);
  $("detailCustomer").textContent = `${order.customer || "Cliente pendiente"} - ${order.phone || ""}`;
  $("detailStatus").textContent = statusLabels[order.status] || order.status;
  $("detailStatus").className = `chip ${order.status}`;
  $("detailItems").innerHTML = orderLineItems(order).map((item) => `
    <article class="line-item">
      <strong>${escapeHtml(item.productName)} x${escapeHtml(item.quantity || 1)}</strong>
      <span>${escapeHtml(lineDetails(item))}</span>
      <b>${item.priceStatus === "review_required" ? "Por revisar" : money(item.total)}</b>
    </article>
  `).join("") || emptyState("El pedido no tiene productos.");
  $("detailItems").insertAdjacentHTML("afterbegin", `
    <article class="line-item">
      <strong>Pago</strong>
      <span>${escapeHtml(order.payment || "Pago pendiente")}</span>
      <b>${escapeHtml(order.paymentStatusLabel || paymentStatusLabel(order))}</b>
    </article>
  `);
  $("detailSubtotal").textContent = money(order.subtotal);
  $("detailDelivery").textContent = money(order.delivery);
  $("detailTotal").textContent = money(order.total);
  $("editAddress").value = order.address || "";
  $("editPayment").value = order.payment || "";
  $("editDeliveryFee").value = money(order.delivery);
  $("editNote").value = order.note || "";
}

function orderLineItems(order) {
  if (Array.isArray(order.lineItems) && order.lineItems.length) return order.lineItems;
  return (order.items || []).map((text) => ({
    productName: text,
    quantity: 1,
    total: 0,
    additions: [],
    removals: [],
    selectedOptions: [],
    priceStatus: "review_required"
  }));
}

function lineDetails(item) {
  const additions = (item.additions || []).map((entry) => `+ ${entry.name}`);
  const removals = (item.removals || []).map((entry) => `sin ${entry}`);
  const options = (item.selectedOptions || []).map((entry) => `${entry.label}: ${entry.value}`);
  const notes = item.notes ? [item.notes] : [];
  return [...options, ...additions, ...removals, ...notes].join(" - ") || "Sin cambios";
}

function paymentStatusLabel(order) {
  if (!order.payment || order.payment === "Pendiente") return "Pago pendiente";
  if (order.payment === "Contra entrega") return "Pago contra entrega";
  return order.paymentProofReceived ? "Comprobante recibido, pendiente de verificacion" : "Falta comprobante";
}

function renderConversations() {
  $("conversationCount").textContent = state.conversations.length;
  $("conversationList").innerHTML = state.conversations.length
    ? state.conversations.map((conversation) => `
      <button class="conversation-card ${conversation.id === state.selectedConversationId ? "active" : ""}" data-conversation-id="${escapeAttr(conversation.id)}">
        <strong>${escapeHtml(conversation.name || "Cliente")}</strong>
        <span>${escapeHtml(conversation.meta || "")}</span>
        <small>${escapeHtml(conversation.last || "")}</small>
        ${conversation.human ? `<b>Requiere operario</b>` : ""}
      </button>
    `).join("")
    : emptyState("Sin conversaciones todavia.");

  const conversation = selectedConversation();
  $("chatName").textContent = conversation?.name || "Selecciona una conversacion";
  $("chatMeta").textContent = conversation ? `${conversation.meta || ""} - ${conversation.state || ""}` : "";
  $("chatPauseToggle").disabled = !conversation;
  $("chatSend").disabled = !conversation;
  $("chatPauseToggle").textContent = conversation && isPauseActive(conversation.botPausedUntil)
    ? "Reactivar bot"
    : "Pausar bot";
  $("chatMessages").innerHTML = conversation
    ? (conversation.messages || []).map(([role, text]) => `
      <div class="message ${role === "user" ? "user" : "bot"}">
        <span>${escapeHtml(role === "user" ? "Cliente" : "Bot/Operario")}</span>
        <p>${escapeHtml(text)}</p>
      </div>
    `).join("")
    : emptyState("Selecciona una conversacion para responder.");
}

function renderAvailability() {
  renderBotCatalogPreview();
  const query = normalize(state.availabilitySearch);
  const products = state.products.filter((product) => !query || normalize(product.name).includes(query) || normalize(product.category).includes(query));
  const modifiers = state.modifiers.filter((modifier) => !query || normalize(modifier.name).includes(query));
  $("availabilityProducts").innerHTML = products.length
    ? products.map((product) => availabilityRow(product, "product")).join("")
    : emptyState("No hay productos para mostrar.");
  $("availabilityModifiers").innerHTML = modifiers.length
    ? modifiers.map((modifier) => availabilityRow(modifier, "modifier")).join("")
    : emptyState("No hay toppings o adiciones para mostrar.");
}

function renderBotCatalogPreview() {
  const catalog = state.botCatalog;
  if (!catalog) {
    $("botCatalogSummary").textContent = "Sin sincronizar";
    $("botCatalogPreview").innerHTML = emptyState("No se pudo leer la vista del bot.");
    return;
  }

  const availableProducts = catalog.productos || [];
  const availableModifiers = [...(catalog.toppings || []), ...(catalog.adiciones || [])];
  const unavailableProducts = catalog.agotados?.productos || [];
  const unavailableModifiers = catalog.agotados?.modificadores || [];
  $("botCatalogSummary").textContent =
    `${availableProducts.length} productos, ${availableModifiers.length} toppings/adiciones, ${unavailableProducts.length + unavailableModifiers.length} agotados`;

  const available = [...availableProducts, ...availableModifiers].slice(0, 8);
  const unavailable = [...unavailableProducts, ...unavailableModifiers].slice(0, 8);
  $("botCatalogPreview").innerHTML = [
    `<div><b>Disponibles para chat</b><span>${available.map((item) => {
      const price = Number(item.price);
      return `${escapeHtml(item.name)} ${Number.isFinite(price) && price > 0 ? `(${money(price)})` : ""}`;
    }).join(", ") || "Ninguno"}</span></div>`,
    `<div><b>Marcados como agotados</b><span>${unavailable.map((item) => escapeHtml(item.name)).join(", ") || "Ninguno"}</span></div>`
  ].join("");
}

function availabilityRow(item, type) {
  const available = type === "product"
    ? item.isActive !== false && !item.isOutOfStock
    : item.isActive !== false;
  return `
    <article class="availability-row">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.category || "")} ${item.price ? `- ${money(item.price)}` : ""}</span>
      </div>
      <button class="toggle ${available ? "on" : ""}" data-availability-type="${type}" data-availability-id="${escapeAttr(item.id)}">
        ${available ? "Disponible" : "Agotado"}
      </button>
    </article>
  `;
}

function renderCatalog() {
  $("catalogProducts").innerHTML = state.products.length
    ? state.products.map((product) => `
      <article class="catalog-row">
        <div>
          <strong>${escapeHtml(product.name)}</strong>
          <span>${escapeHtml(product.category || "Sin categoria")} - ${money(product.price)}</span>
        </div>
        <button class="secondary-btn" data-edit-product="${escapeAttr(product.id)}">Editar</button>
      </article>
    `).join("")
    : emptyState("No hay productos cargados.");
  $("catalogModifiers").innerHTML = state.modifiers.length
    ? state.modifiers.map((modifier) => `
      <article class="catalog-row">
        <div>
          <strong>${escapeHtml(modifier.name)}</strong>
          <span>${money(modifier.price)}</span>
        </div>
        <button class="secondary-btn" data-edit-modifier="${escapeAttr(modifier.id)}">Editar</button>
      </article>
    `).join("")
    : emptyState("No hay toppings o adiciones cargadas.");
  renderPaymentMethods();
}

function renderPaymentMethods() {
  const methods = state.paymentMethods.filter((method) =>
    ["pm_nequi", "pm_bancolombia", "pm_bre_b"].includes(method.id)
  );
  $("paymentMethods").innerHTML = methods.length
    ? methods.map((method) => `
      <article class="payment-row" data-payment-row="${escapeAttr(method.id)}">
        <div>
          <strong>${escapeHtml(method.name)}</strong>
          <span>${method.isActive ? "Activo" : "Inactivo"} - ${method.requiresProof ? "requiere comprobante" : "sin comprobante"}</span>
        </div>
        <label>
          Etiqueta
          <input data-payment-field="accountLabel" value="${escapeAttr(method.accountLabel || "")}" placeholder="Etiqueta visible">
        </label>
        <label>
          Numero o llave
          <input data-payment-field="accountValue" value="${escapeAttr(method.accountValue || "")}" placeholder="Numero, cuenta o llave">
        </label>
        <button class="secondary-btn" data-save-payment="${escapeAttr(method.id)}">Guardar</button>
      </article>
    `).join("")
    : emptyState("No hay metodos de pago configurados.");
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function orderLabel(order) {
  const number = Number(order.displayNumber);
  return Number.isFinite(number) ? `Pedido #${number}` : `Pedido ${order.id}`;
}

function isPauseActive(value) {
  return Boolean(value && new Date(value).getTime() > Date.now());
}

async function setOrderStatus(status) {
  const order = selectedOrder();
  if (!order) return;
  if (!nextStatuses[order.status]?.includes(status)) {
    showToast("Esa accion no aplica para el estado actual.");
    return;
  }
  if (status === "cancelled" && !window.confirm(`Cancelar ${orderLabel(order)}?`)) return;
  try {
    const updated = isDemoMode()
      ? { ...order, status }
      : await adminApi.updateOrderStatus(order, status);
    replaceById(state.orders, updated);
    state.selectedOrderId = updated.id;
    renderAll();
    showToast(`${orderLabel(updated)} actualizado.`);
  } catch (error) {
    console.error(error);
    showToast("No pude actualizar el pedido.");
  }
}

async function confirmSelectedOrder() {
  const order = selectedOrder();
  if (!order) return;
  const deliveryFee = parseMoney($("editDeliveryFee").value || order.delivery);
  try {
    const updated = isDemoMode()
      ? { ...order, delivery: deliveryFee, total: Number(order.subtotal || 0) + deliveryFee, status: "confirmed" }
      : await adminApi.confirmOrderAndNotify(order, { deliveryFee, note: $("editNote").value });
    replaceById(state.orders, updated);
    state.selectedOrderId = updated.id;
    renderAll();
    showToast("Pedido confirmado y cliente notificado.");
  } catch (error) {
    console.error(error);
    showToast("No pude confirmar. Revisa datos, pago y domicilio.");
  }
}

async function notifyDispatch() {
  const order = selectedOrder();
  if (!order) return;
  try {
    const updated = isDemoMode()
      ? { ...order, status: "dispatched", dispatchNotified: true }
      : await adminApi.notifyDispatched(order);
    replaceById(state.orders, updated);
    state.selectedOrderId = updated.id;
    renderAll();
    showToast("Cliente avisado del despacho.");
  } catch (error) {
    console.error(error);
    showToast("No pude avisar despacho.");
  }
}

async function saveOrderEdit() {
  const order = selectedOrder();
  if (!order) return;
  const patch = {
    address: $("editAddress").value,
    payment: $("editPayment").value,
    deliveryFee: parseMoney($("editDeliveryFee").value),
    note: $("editNote").value
  };
  try {
    const updated = isDemoMode()
      ? { ...order, ...patch, delivery: patch.deliveryFee, total: Number(order.subtotal || 0) + patch.deliveryFee }
      : await adminApi.updateOrder(order, patch);
    replaceById(state.orders, updated);
    state.selectedOrderId = updated.id;
    renderAll();
    showToast("Cambios guardados.");
  } catch (error) {
    console.error(error);
    showToast("No pude guardar el pedido.");
  }
}

async function sendConversationReply() {
  const conversation = selectedConversation();
  const text = $("chatReplyInput").value.trim();
  if (!conversation || !text) return;
  try {
    const updated = isDemoMode()
      ? { ...conversation, last: text, messages: [...(conversation.messages || []), ["bot", text]], human: true }
      : await adminApi.sendConversationMessage(conversation, text);
    replaceById(state.conversations, updated);
    state.selectedConversationId = updated.id;
    $("chatReplyInput").value = "";
    renderConversations();
    showToast("Mensaje enviado.");
  } catch (error) {
    console.error(error);
    showToast("No pude enviar el mensaje.");
  }
}

async function toggleConversationPause() {
  const conversation = selectedConversation();
  if (!conversation) return;
  const paused = !isPauseActive(conversation.botPausedUntil);
  try {
    const updated = isDemoMode()
      ? {
          ...conversation,
          botPausedUntil: paused ? new Date(Date.now() + 30 * 60_000).toISOString() : null,
          human: paused
        }
      : await adminApi.setConversationBotPause(conversation, {
          paused,
          minutes: 30,
          reason: paused ? "Pausado manualmente por operario" : null
        });
    replaceById(state.conversations, updated);
    state.selectedConversationId = updated.id;
    renderConversations();
    showToast(paused ? "Bot pausado en este chat." : "Bot reactivado en este chat.");
  } catch (error) {
    console.error(error);
    showToast("No pude cambiar la pausa del chat.");
  }
}

async function toggleGlobalBot() {
  const paused = !isPauseActive(state.businessStatus?.botPausedUntil);
  try {
    state.businessStatus = isDemoMode()
      ? { botPausedUntil: paused ? new Date(Date.now() + 24 * 60 * 60_000).toISOString() : null }
      : await adminApi.setGlobalBotPause({
          paused,
          minutes: 24 * 60,
          reason: paused ? "Pausado manualmente desde dashboard" : null
        });
    renderShell();
    showToast(paused ? "Bot pausado globalmente." : "Bot reactivado.");
  } catch (error) {
    console.error(error);
    showToast("No pude cambiar el estado del bot.");
  }
}

async function toggleAvailability(type, id) {
  const collection = type === "product" ? state.products : state.modifiers;
  const item = collection.find((entry) => entry.id === id);
  if (!item) return;
  const currentlyAvailable = type === "product"
    ? item.isActive !== false && !item.isOutOfStock
    : item.isActive !== false;
  try {
    const updated = isDemoMode()
      ? type === "product"
        ? { ...item, isActive: true, isOutOfStock: currentlyAvailable }
        : { ...item, isActive: !currentlyAvailable }
      : type === "product"
        ? await adminApi.updateProductAvailability(item, { isActive: true, isOutOfStock: currentlyAvailable })
        : await adminApi.updateModifierAvailability(item, { isActive: !currentlyAvailable });
    replaceById(collection, type === "product" ? adaptProduct(updated) : adaptModifier(updated));
    renderAvailability();
    renderCatalog();
    showToast(`${item.name} quedo ${currentlyAvailable ? "agotado" : "disponible"}.`);
  } catch (error) {
    console.error(error);
    showToast("No pude guardar disponibilidad.");
  }
}

async function addProduct() {
  const name = window.prompt("Nombre del producto");
  if (!name) return;
  const price = parseMoney(window.prompt("Precio", "0"));
  const category = window.prompt("Categoria", "Fresas") || "Fresas";
  const payload = {
    name: name.trim(),
    category,
    basePrice: price,
    aliases: [],
    description: "",
    modifierGroupIds: ["mg_toppings"],
    defaultComponents: [],
    removableComponents: [],
    allowsFreeTextCustomizations: true
  };
  try {
    const created = isDemoMode()
      ? { id: `demo_product_${Date.now()}`, ...payload, price, isActive: true, isOutOfStock: false }
      : await adminApi.createProduct(payload);
    replaceById(state.products, adaptProduct(created));
    renderAvailability();
    renderCatalog();
    showToast("Producto agregado.");
  } catch (error) {
    console.error(error);
    showToast("No pude agregar el producto.");
  }
}

async function editProduct(id) {
  const product = state.products.find((entry) => entry.id === id);
  if (!product) return;
  const name = window.prompt("Nombre del producto", product.name);
  if (!name) return;
  const price = parseMoney(window.prompt("Precio", String(product.price)));
  const category = window.prompt("Categoria", product.category || "Fresas") || product.category;
  const patch = { name: name.trim(), basePrice: price, category };
  try {
    const updated = isDemoMode() ? { ...product, ...patch, price } : await adminApi.updateProduct(product, patch);
    replaceById(state.products, adaptProduct(updated));
    renderAvailability();
    renderCatalog();
    showToast("Producto actualizado.");
  } catch (error) {
    console.error(error);
    showToast("No pude editar el producto.");
  }
}

async function addModifier() {
  const name = window.prompt("Nombre del topping o adicion");
  if (!name) return;
  const price = parseMoney(window.prompt("Precio", "0"));
  const payload = {
    modifierGroupId: "mg_toppings",
    name: name.trim(),
    aliases: [normalize(name)],
    priceDelta: price,
    isActive: true
  };
  try {
    const created = isDemoMode()
      ? { id: `demo_modifier_${Date.now()}`, ...payload, price, isActive: true }
      : await adminApi.createModifier(payload);
    replaceById(state.modifiers, adaptModifier(created));
    renderAvailability();
    renderCatalog();
    showToast("Topping agregado.");
  } catch (error) {
    console.error(error);
    showToast("No pude agregar el topping.");
  }
}

async function editModifier(id) {
  const modifier = state.modifiers.find((entry) => entry.id === id);
  if (!modifier) return;
  const name = window.prompt("Nombre", modifier.name);
  if (!name) return;
  const price = parseMoney(window.prompt("Precio", String(modifier.price)));
  const patch = { name: name.trim(), priceDelta: price };
  try {
    const updated = isDemoMode() ? { ...modifier, ...patch, price } : await adminApi.updateModifier(modifier, patch);
    replaceById(state.modifiers, adaptModifier(updated));
    renderAvailability();
    renderCatalog();
    showToast("Topping actualizado.");
  } catch (error) {
    console.error(error);
    showToast("No pude editar el topping.");
  }
}

async function savePaymentMethod(methodId) {
  const method = state.paymentMethods.find((entry) => entry.id === methodId);
  const row = document.querySelector(`[data-payment-row="${CSS.escape(methodId)}"]`);
  if (!method || !row) return;

  const patch = {
    accountLabel: row.querySelector('[data-payment-field="accountLabel"]')?.value.trim() || null,
    accountValue: row.querySelector('[data-payment-field="accountValue"]')?.value.trim() || null
  };

  try {
    const updated = isDemoMode() ? { ...method, ...patch } : await adminApi.updatePaymentMethod(method, patch);
    state.paymentMethods = state.paymentMethods.map((entry) => entry.id === methodId ? updated : entry);
    renderCatalog();
    showToast("Datos de pago actualizados.");
  } catch (error) {
    console.error(error);
    showToast("No pude guardar los datos de pago.");
  }
}

function bindEvents() {
  $("enterBtn").addEventListener("click", enterDashboard);
  $("refreshBtn").addEventListener("click", () => refreshData({ quiet: false }));
  $("globalBotToggle").addEventListener("click", toggleGlobalBot);
  $("globalSearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderOperation();
    renderOrders();
  });
  $("availabilitySearch").addEventListener("input", (event) => {
    state.availabilitySearch = event.target.value;
    renderAvailability();
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll("[data-status-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.orderStatusFilter = button.dataset.statusFilter;
      setView("orders");
      renderOrders();
    });
  });
  document.querySelectorAll("[data-view-jump]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewJump));
  });

  document.addEventListener("click", async (event) => {
    const orderCard = event.target.closest("[data-order-id]");
    if (orderCard) {
      state.selectedOrderId = orderCard.dataset.orderId;
      renderDetail();
      setView("detail");
      return;
    }

    const conversationCard = event.target.closest("[data-conversation-id]");
    if (conversationCard) {
      state.selectedConversationId = conversationCard.dataset.conversationId;
      renderConversations();
      return;
    }

    const filter = event.target.closest("[data-filter-status]");
    if (filter) {
      state.orderStatusFilter = filter.dataset.filterStatus;
      renderOrders();
      return;
    }

    const availabilityButton = event.target.closest("[data-availability-id]");
    if (availabilityButton) {
      await toggleAvailability(availabilityButton.dataset.availabilityType, availabilityButton.dataset.availabilityId);
      return;
    }

    const productButton = event.target.closest("[data-edit-product]");
    if (productButton) {
      await editProduct(productButton.dataset.editProduct);
      return;
    }

    const modifierButton = event.target.closest("[data-edit-modifier]");
    if (modifierButton) {
      await editModifier(modifierButton.dataset.editModifier);
      return;
    }

    const paymentButton = event.target.closest("[data-save-payment]");
    if (paymentButton) {
      await savePaymentMethod(paymentButton.dataset.savePayment);
    }
  });

  $("backToOrders").addEventListener("click", () => setView("orders"));
  $("saveOrderEdit").addEventListener("click", saveOrderEdit);
  $("chatSend").addEventListener("click", sendConversationReply);
  $("chatPauseToggle").addEventListener("click", toggleConversationPause);
  $("addProductBtn").addEventListener("click", addProduct);
  $("addModifierBtn").addEventListener("click", addModifier);
  document.querySelectorAll("[data-order-status]").forEach((button) => {
    button.addEventListener("click", () => setOrderStatus(button.dataset.orderStatus));
  });
  document.querySelectorAll("[data-order-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.orderAction === "confirm") confirmSelectedOrder();
      if (button.dataset.orderAction === "notify-dispatched") notifyDispatch();
    });
  });
}

bindEvents();
