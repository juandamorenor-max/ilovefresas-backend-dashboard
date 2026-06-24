import { demoStore } from "../data/demoStore.js";
import { persistRuntimeStore } from "../data/runtime-store.js";
import { createId, nowIso } from "../utils/id.js";
import type { Business, BusinessHour, PaymentMethodSetting, SpecialClosure } from "../types/index.js";
import { corePaymentMethodSettings, normalizePaymentMethodSetting } from "./payment-method-settings.js";

export class AdminService {
  getBusinessStatus() {
    return demoStore.businesses[0].status;
  }

  listBusinessHours() {
    return demoStore.businessHours;
  }

  listPaymentMethods() {
    return this.syncActivePaymentMethodNames(demoStore.businesses[0]).paymentMethodSettings;
  }

  updateBusinessStatus(payload: Partial<Business["status"]>) {
    const business = demoStore.businesses[0];
    business.status = { ...business.status, ...payload };
    business.updatedAt = nowIso();
    persistRuntimeStore();
    return business.status;
  }

  updateBusinessHour(hourId: string, payload: Partial<Pick<BusinessHour, "opensAt" | "closesAt" | "isOpen">>) {
    const hour = demoStore.businessHours.find((entry) => entry.id === hourId);
    if (!hour) {
      return null;
    }

    if (typeof payload.opensAt === "string" && /^\d{2}:\d{2}$/.test(payload.opensAt)) {
      hour.opensAt = payload.opensAt;
    }

    if (typeof payload.closesAt === "string" && /^\d{2}:\d{2}$/.test(payload.closesAt)) {
      hour.closesAt = payload.closesAt;
    }

    if (typeof payload.isOpen === "boolean") {
      hour.isOpen = payload.isOpen;
    }

    hour.updatedAt = nowIso();
    persistRuntimeStore();
    return hour;
  }

  updatePaymentMethod(methodId: string, payload: Partial<PaymentMethodSetting>) {
    const business = demoStore.businesses[0];
    const method = business.paymentMethodSettings.find((entry) => entry.id === methodId);
    if (!method) {
      return null;
    }

    if (typeof payload.name === "string" && payload.name.trim()) {
      method.name = payload.name.trim();
    }

    if (Array.isArray(payload.aliases)) {
      method.aliases = payload.aliases.map((alias) => String(alias).trim()).filter(Boolean);
    }

    if (typeof payload.instructions === "string") {
      method.instructions = payload.instructions.trim();
    }

    if (typeof payload.accountLabel === "string" || payload.accountLabel === null) {
      method.accountLabel = typeof payload.accountLabel === "string" ? payload.accountLabel.trim() || null : null;
    }

    if (typeof payload.accountValue === "string" || payload.accountValue === null) {
      method.accountValue = typeof payload.accountValue === "string" ? payload.accountValue.trim() || null : null;
    }

    if (typeof payload.isActive === "boolean") {
      method.isActive = payload.isActive;
    }

    if (typeof payload.requiresProof === "boolean") {
      method.requiresProof = payload.requiresProof;
    }

    if (typeof payload.requiresAmount === "boolean") {
      method.requiresAmount = payload.requiresAmount;
    }

    business.updatedAt = nowIso();
    this.syncActivePaymentMethodNames(business);
    persistRuntimeStore();
    return method;
  }

  private syncActivePaymentMethodNames(business: Business) {
    const before = JSON.stringify(business.paymentMethodSettings);
    const now = nowIso();
    for (const coreMethod of corePaymentMethodSettings()) {
      if (!business.paymentMethodSettings.some((method) => method.id === coreMethod.id)) {
        business.paymentMethodSettings.push(coreMethod);
        business.updatedAt = now;
      }
    }
    business.paymentMethodSettings = business.paymentMethodSettings.map(normalizePaymentMethodSetting);
    business.paymentMethods = business.paymentMethodSettings
      .filter((method) => method.isActive)
      .map((method) => method.name);
    if (JSON.stringify(business.paymentMethodSettings) !== before) {
      business.updatedAt = now;
      persistRuntimeStore();
    }
    return business;
  }

  listSpecialClosures() {
    return demoStore.specialClosures;
  }

  createSpecialClosure(payload: Pick<SpecialClosure, "businessId" | "date" | "reason">) {
    const timestamp = nowIso();
    const closure: SpecialClosure = {
      id: createId("closure"),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...payload
    };

    demoStore.specialClosures.push(closure);
    persistRuntimeStore();
    return closure;
  }

  deleteSpecialClosure(closureId: string) {
    const index = demoStore.specialClosures.findIndex((closure) => closure.id === closureId);
    if (index === -1) {
      return false;
    }

    demoStore.specialClosures.splice(index, 1);
    persistRuntimeStore();
    return true;
  }
}
