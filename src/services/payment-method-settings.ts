import type { PaymentMethodSetting } from "../types/index.js";

type PaymentDefaults = Pick<PaymentMethodSetting, "accountLabel" | "accountValue">;

const paymentDefaults: Record<string, PaymentDefaults> = {
  pm_nequi: {
    accountLabel: "Nequi",
    accountValue: "3000000000"
  },
  pm_bancolombia: {
    accountLabel: "Cuenta Bancolombia",
    accountValue: "72600000000"
  },
  pm_bre_b: {
    accountLabel: "Llave Bre-B",
    accountValue: "@test"
  }
};

export function corePaymentMethodSettings(): PaymentMethodSetting[] {
  return [
    {
      id: "pm_nequi",
      name: "Nequi",
      aliases: ["nequi", "neqi", "neky"],
      instructions: "Solicitar comprobante antes de despachar.",
      accountLabel: "Nequi",
      accountValue: "3000000000",
      isActive: true,
      requiresProof: true,
      requiresAmount: false
    },
    {
      id: "pm_bancolombia",
      name: "Bancolombia",
      aliases: ["bancolombia", "banco", "bancol", "transferencia bancolombia"],
      instructions: "Validar comprobante de transferencia.",
      accountLabel: "Cuenta Bancolombia",
      accountValue: "72600000000",
      isActive: true,
      requiresProof: true,
      requiresAmount: false
    },
    {
      id: "pm_bre_b",
      name: "Bre-B",
      aliases: ["breb", "bre-b", "llave breb", "llave bre-b"],
      instructions: "Validar comprobante de transferencia por llave.",
      accountLabel: "Llave Bre-B",
      accountValue: "@test",
      isActive: true,
      requiresProof: true,
      requiresAmount: false
    }
  ];
}

export function defaultPaymentAccount(method: Pick<PaymentMethodSetting, "id" | "name">): PaymentDefaults {
  return paymentDefaults[method.id] ?? matchPaymentDefaults(method.name) ?? {
    accountLabel: null,
    accountValue: null
  };
}

export function normalizePaymentMethodSetting(method: PaymentMethodSetting): PaymentMethodSetting {
  const defaults = defaultPaymentAccount(method);
  return {
    ...method,
    accountLabel: cleanNullableString(method.accountLabel) ?? defaults.accountLabel,
    accountValue: cleanNullableString(method.accountValue) ?? defaults.accountValue
  };
}

export function paymentMethodMatches(method: PaymentMethodSetting, paymentMethod: string) {
  const normalizedPaymentMethod = normalizeText(paymentMethod);
  const names = [method.name, ...method.aliases].map(normalizeText);
  return names.some((name) => name && normalizedPaymentMethod.includes(name));
}

function matchPaymentDefaults(name: string): PaymentDefaults | null {
  const normalized = normalizeText(name);
  if (normalized.includes("nequi")) return paymentDefaults.pm_nequi;
  if (normalized.includes("bancolombia") || normalized.includes("banco")) return paymentDefaults.pm_bancolombia;
  if (normalized.includes("bre")) return paymentDefaults.pm_bre_b;
  return null;
}

function cleanNullableString(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
