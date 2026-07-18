export type MessageRole = "customer" | "bot" | "operator";

export type ConversationState =
  | "idle"
  | "collecting_items"
  | "collecting_delivery_details"
  | "collecting_name"
  | "collecting_address"
  | "collecting_zone"
  | "collecting_payment"
  | "collecting_notes"
  | "confirming_order"
  | "awaiting_payment_proof"
  | "pending_human"
  | "post_order_closed"
  | "completed"
  | "cancelled";

export type Intent =
  | "greeting"
  | "place_order"
  | "ask_menu"
  | "ask_hours"
  | "ask_payment_methods"
  | "ask_delivery_zones"
  | "ask_recommendation"
  | "business_question"
  | "modify_order"
  | "cancel_order"
  | "talk_to_human"
  | "small_talk"
  | "unknown";

export interface Timestamped {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Business extends Timestamped {
  name: string;
  slug: string;
  whatsappNumber: string;
  welcomeMessage: string;
  paymentMethods: string[];
  paymentMethodSettings: PaymentMethodSetting[];
  faqs: Array<{ question: string; answer: string }>;
  status: {
    manualOpenOverride: boolean | null;
    deliveryEnabled: boolean;
    acceptingOrders: boolean;
    botPausedUntil: string | null;
    botPausedReason: string | null;
  };
}

export interface PaymentMethodSetting {
  id: string;
  name: string;
  aliases: string[];
  instructions: string;
  accountLabel: string | null;
  accountValue: string | null;
  isActive: boolean;
  requiresProof: boolean;
  requiresAmount: boolean;
}

export interface BusinessHour extends Timestamped {
  businessId: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isOpen: boolean;
}

export interface SpecialClosure extends Timestamped {
  businessId: string;
  date: string;
  reason: string;
}

export interface DeliveryZone extends Timestamped {
  businessId: string;
  name: string;
  aliases: string[];
  fee: number;
  isActive: boolean;
}

export interface ModifierOption extends Timestamped {
  businessId: string;
  modifierGroupId: string;
  name: string;
  aliases: string[];
  priceDelta: number;
  isActive: boolean;
}

export interface ModifierGroup extends Timestamped {
  businessId: string;
  name: string;
  selectionMode: "single" | "multiple";
  minSelections: number;
  maxSelections: number;
  optionIds: string[];
}

export interface ProductRequiredOption {
  key: string;
  label: string;
  options: string[];
  required: boolean;
  minSelections: number;
  maxSelections: number;
}

export interface Product extends Timestamped {
  businessId: string;
  name: string;
  aliases: string[];
  category: string;
  description: string;
  basePrice: number;
  isActive: boolean;
  isOutOfStock: boolean;
  modifierGroupIds: string[];
  defaultComponents: string[];
  removableComponents: string[];
  requiredOptions?: ProductRequiredOption[];
  allowsFreeTextCustomizations: boolean;
}

export interface Promotion extends Timestamped {
  businessId: string;
  name: string;
  type:
    | "fixed_price"
    | "combo"
    | "percent_discount"
    | "flat_discount"
    | "free_addon"
    | "buy_x_get_y";
  isActive: boolean;
  config: Record<string, unknown>;
}

export interface Customer extends Timestamped {
  businessId: string;
  phone: string;
  name: string | null;
}

export interface OrderItemComponent {
  name: string;
  type: "default" | "removed" | "added" | "replaced";
  priceDelta: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitBasePrice: number;
  components: OrderItemComponent[];
  selectedOptions?: Record<string, string[]>;
  selectedOptionQuantities?: Record<string, Record<string, number>>;
  notes: string | null;
}

export interface PendingSelection {
  id: string;
  type: "required_option" | "modifier_clarification" | "product_clarification" | "catalog_choice";
  targetItemId: string | null;
  targetProductId: string | null;
  label: string;
  options: string[];
  blocking: boolean;
  question: string;
}

export interface PricingBreakdown {
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
}

export interface OrderDraft {
  id: string;
  businessId: string;
  customerPhone: string;
  items: OrderItem[];
  fulfillmentType: "delivery" | "pickup";
  customerName: string | null;
  address: string | null;
  neighborhood?: string | null;
  neighborhoodValidationAttempts?: number;
  lastInvalidNeighborhood?: string | null;
  addressReference?: string | null;
  inferredZoneId: string | null;
  paymentMethod: string | null;
  paymentProofReceived: boolean;
  paymentProofNote: string | null;
  cashAmount: string | null;
  notes: string | null;
  pendingSelections: PendingSelection[];
  blockingIssue: string | null;
  pricing: PricingBreakdown;
}

export interface Conversation extends Timestamped {
  businessId: string;
  customerPhone: string;
  state: ConversationState;
  aiUsageCount: number;
  draftOrder: OrderDraft | null;
  activeOrderId: string | null;
  activeQuoteId?: string | null;
  botPausedUntil: string | null;
  botPausedReason: string | null;
  postOrderEvents?: PostOrderEvent[];
  memory: {
    recentMessages: Array<{
      role: MessageRole;
      text: string;
      createdAt: string;
    }>;
    summary: string | null;
    lastBotOffer: "menu" | "order" | "delivery_details" | "payment_methods" | "human_help" | null;
  };
}

export interface PostOrderEvent extends Timestamped {
  orderId: string;
  type:
    | "conversation_close"
    | "delivery_status_question"
    | "repeated_status_question"
    | "delivery_issue"
    | "change_after_dispatch"
    | "new_order_request"
    | "small_talk"
    | "unknown";
  orderStatus: Order["status"];
  severity: "low" | "medium" | "high" | "critical";
  handledByBot: boolean;
  needsHuman: boolean;
  humanReason: string | null;
  customerMessage: string;
  suggestedAction: string | null;
}

export interface Message extends Timestamped {
  businessId: string;
  conversationId: string;
  customerPhone: string;
  role: MessageRole;
  text: string;
}

export type ConversationTraceSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface ConversationTraceAlert {
  code: string;
  title: string;
  detail: string;
  severity: ConversationTraceSeverity;
}

export interface ConversationTraceFeedback {
  status: "unreviewed" | "ok" | "bug" | "needs_human" | "bot_should_handle";
  note: string | null;
  updatedAt: string | null;
}

export interface ConversationTrace extends Timestamped {
  businessId: string;
  conversationId: string;
  customerPhone: string;
  customerMessageId: string | null;
  botMessageId: string | null;
  customerText: string;
  finalReply: string;
  provider: string;
  classificationSource: string;
  replySource: string;
  stateBefore: ConversationState;
  stateAfter: ConversationState;
  activeOrderIdBefore: string | null;
  activeOrderIdAfter: string | null;
  draftBefore: unknown;
  draftAfter: unknown;
  openAIJson: unknown;
  openAIError: string | null;
  proposedReply: string | null;
  replyWasOverridden: boolean;
  backendAppliedPatch: unknown;
  guardrailsApplied: string[];
  alerts: ConversationTraceAlert[];
  severity: ConversationTraceSeverity;
  feedback: ConversationTraceFeedback;
}

export interface Order extends Timestamped {
  businessId: string;
  customerPhone: string;
  fulfillmentType: "delivery" | "pickup";
  customerName: string | null;
  address: string | null;
  neighborhood?: string | null;
  addressReference?: string | null;
  zoneName: string | null;
  paymentMethod: string | null;
  paymentProofReceived: boolean;
  paymentProofNote: string | null;
  cashAmount: string | null;
  notes: string | null;
  items: OrderItem[];
  pricing: PricingBreakdown;
  status:
    | "pending_review"
    | "confirmed"
    | "preparing"
    | "dispatched"
    | "completed"
    | "cancelled";
  internalNotes: string | null;
}

export interface BotQuote extends Timestamped {
  businessId: string;
  conversationId: string | null;
  requestFingerprint: string;
  fulfillmentType: "delivery" | "pickup";
  neighborhood: string | null;
  normalizedItems: OrderItem[];
  pricing: PricingBreakdown;
  expiresAt: string;
  consumedAt: string | null;
}

export interface AdminUser extends Timestamped {
  businessId: string;
  email: string;
  name: string;
  role: "admin" | "operator";
}

export interface MessageClassification {
  intent: Intent;
  source: "heuristic" | "openai" | "gemini" | "flowise";
  planner?: {
    action:
      | "continue_order"
      | "answer_question"
      | "collect_delivery"
      | "ask_clarification"
      | "unknown";
    targetItemIndex: number | null;
    targetProductName: string | null;
    requestedComponent: string | null;
    ambiguity: {
      type:
        | "target_item"
        | "catalog_option"
        | "product"
        | "required_option"
        | "none";
      candidates: string[];
      question: string | null;
    } | null;
  } | null;
  extracted: {
    items: Array<{
      productName: string;
      quantity: number;
      additions: string[];
      removals: string[];
      notes: string | null;
    }>;
    customerName: string | null;
    address: string | null;
    zone: string | null;
    paymentMethod: string | null;
    notes: string | null;
  };
  missingFields: string[];
  confidence: number;
}

export interface IncomingWhatsAppTextMessage {
  from: string;
  to: string;
  text: string;
}

export interface IncomingCustomerAttachmentMessage {
  from: string;
  to: string;
  attachmentType: "image" | "document";
  caption?: string | null;
  fileId?: string | null;
  mimeType?: string | null;
}

export interface OutgoingAttachment {
  type: "document" | "photo";
  pathOrUrl: string;
  filename: string;
  caption?: string;
}

export interface ConversationTurnResult {
  reply: string;
  conversationId: string;
  state: ConversationState;
  classificationSource: MessageClassification["source"] | "stateful";
  classification: MessageClassification | null;
  replySource: MessageClassification["source"] | "template";
  aiUsageCount: number;
  attachments: OutgoingAttachment[];
}
