import { demoStore } from "../data/demoStore.js";
import { persistRuntimeStore } from "../data/runtime-store.js";
import { formatCurrency } from "../utils/http.js";
import { createId } from "../utils/id.js";
import { resolveBarranquillaZone } from "../data/geo/barranquilla-zone-resolver.js";
import type {
  DeliveryZone,
  ModifierOption,
  Product
} from "../types/index.js";

const ADDITION_IDS = new Set([
  "mo_helado",
  "mo_queso",
  "mo_nutella",
  "mo_chocorramo",
  "mo_dulce_mora",
  "mo_adicional_crema",
  "mo_barquillo",
  "mo_cerezas",
  "mo_arandanos"
]);

export class CatalogService {
  listProducts() {
    return demoStore.products;
  }

  listActiveProducts() {
    return demoStore.products.filter((product) => product.isActive && !product.isOutOfStock);
  }

  listUnavailableProducts() {
    return demoStore.products.filter((product) => !product.isActive || product.isOutOfStock);
  }

  listUnavailableModifierOptions() {
    return demoStore.modifierOptions.filter((option) => !option.isActive);
  }

  listDeliveryZones() {
    return demoStore.deliveryZones.filter((zone) => zone.isActive);
  }

  listModifierOptions() {
    return demoStore.modifierOptions.filter((option) => option.isActive);
  }

  listModifierOptionsForAdmin() {
    return demoStore.modifierOptions;
  }

  getBotAvailableCatalog() {
    const activeModifiers = this.listModifierOptions();

    return {
      productos: this.listActiveProducts().map((product) => this.toBotCatalogProduct(product)),
      toppings: activeModifiers
        .filter((modifier) => !ADDITION_IDS.has(modifier.id))
        .map((modifier) => this.toBotCatalogModifier(modifier, "topping")),
      adiciones: activeModifiers
        .filter((modifier) => ADDITION_IDS.has(modifier.id))
        .map((modifier) => this.toBotCatalogModifier(modifier, "adicion")),
      agotados: {
        productos: this.listUnavailableProducts().map((product) => this.toBotCatalogProduct(product)),
        modificadores: this.listUnavailableModifierOptions().map((modifier) =>
          this.toBotCatalogModifier(modifier, ADDITION_IDS.has(modifier.id) ? "adicion" : "topping")
        )
      }
    };
  }

  findProductById(productId: string) {
    return demoStore.products.find((product) => product.id === productId) ?? null;
  }

  findProductByNameOrAlias(value: string) {
    const lowerValue = this.normalizeForMatching(value);
    return (
      this.listActiveProducts().find((product) =>
        this.buildNormalizedCandidates([product.name, ...product.aliases]).some(
          (candidate) => candidate === lowerValue
        )
      ) ?? null
    );
  }

  findProductsMentioned(text: string): Product[] {
    return this.findProductsMentionedIn(this.listActiveProducts(), text);
  }

  findUnavailableProductsMentioned(text: string): Product[] {
    return this.findProductsMentionedIn(this.listUnavailableProducts(), text);
  }

  private findProductsMentionedIn(products: Product[], text: string): Product[] {
    const lowerText = this.normalizeForMatching(text);
    const matches = products.flatMap((product) => {
      const candidates = this.buildNormalizedCandidates([product.name, ...product.aliases]);

      return candidates.flatMap((candidate) =>
        this.findCandidateOccurrences(lowerText, candidate).map((occurrence) => ({
          product,
          candidate,
          start: occurrence.start,
          end: occurrence.end,
          length: candidate.length
        }))
      );
    });

    const selected = matches
      .sort((a, b) => b.length - a.length || a.start - b.start)
      .reduce<typeof matches>((acc, entry) => {
        const overlapsLongerMatch = acc.some(
          (selectedEntry) =>
            selectedEntry.product.id !== entry.product.id &&
            entry.start < selectedEntry.end &&
            selectedEntry.start < entry.end
        );

        if (!overlapsLongerMatch) {
          acc.push(entry);
        }

        return acc;
      }, [])
      .sort((a, b) => a.start - b.start || b.length - a.length);

    return selected
      .filter((entry, index, list) => list.findIndex((item) => item.product.id === entry.product.id) === index)
      .map((entry) => entry.product);
  }

  private findCandidateOccurrences(text: string, candidate: string) {
    const occurrences: Array<{ start: number; end: number }> = [];
    if (!candidate) {
      return occurrences;
    }

    let start = 0;
    while (start < text.length) {
      const index = text.indexOf(candidate, start);
      if (index < 0) {
        break;
      }

      const before = index === 0 ? " " : text[index - 1] ?? " ";
      const after = text[index + candidate.length] ?? " ";
      const startsCleanly = !/[\p{L}0-9]/u.test(before);
      const endsCleanly = !/[\p{L}0-9]/u.test(after);

      if (startsCleanly && endsCleanly) {
        occurrences.push({ start: index, end: index + candidate.length });
      }

      start = index + Math.max(candidate.length, 1);
    }

    return occurrences;
  }

  findModifierOptionsMentioned(text: string): ModifierOption[] {
    return this.findModifierOptionsMentionedIn(this.listModifierOptions(), text);
  }

  findUnavailableModifierOptionsMentioned(text: string): ModifierOption[] {
    return this.findModifierOptionsMentionedIn(this.listUnavailableModifierOptions(), text);
  }

  private findModifierOptionsMentionedIn(modifiers: ModifierOption[], text: string): ModifierOption[] {
    const lowerText = this.normalizeForMatching(text);
    const matches = modifiers.flatMap((modifier) => {
      const candidates = this.buildNormalizedCandidates([modifier.name, ...modifier.aliases]);

      return candidates.flatMap((candidate) =>
        this.findCandidateOccurrences(lowerText, candidate).map((occurrence) => ({
          modifier,
          candidate,
          start: occurrence.start,
          end: occurrence.end,
          length: candidate.length
        }))
      );
    });

    const selected = matches
      .sort((a, b) => b.length - a.length || a.start - b.start)
      .reduce<typeof matches>((acc, entry) => {
        const overlapsLongerMatch = acc.some(
          (selectedEntry) =>
            selectedEntry.modifier.id !== entry.modifier.id &&
            entry.start < selectedEntry.end &&
            selectedEntry.start < entry.end
        );

        if (!overlapsLongerMatch) {
          acc.push(entry);
        }

        return acc;
      }, [])
      .sort((a, b) => a.start - b.start || b.length - a.length);

    return selected
      .filter((entry, index, list) => list.findIndex((item) => item.modifier.id === entry.modifier.id) === index)
      .map((entry) => entry.modifier);
  }

  findModifierOptionByNameOrAlias(value: string) {
    const lowerValue = this.normalizeForMatching(value);
    return (
      this.listModifierOptions().find((option) =>
        this.buildNormalizedCandidates([option.name, ...option.aliases]).some(
          (candidate) => candidate === lowerValue
        )
      ) ?? null
    );
  }

  findModifierOptionById(modifierId: string) {
    return demoStore.modifierOptions.find((option) => option.id === modifierId) ?? null;
  }

  buildAiCatalogContext() {
    return JSON.stringify({
      products: this.listProducts().map((product) => ({
        name: product.name,
        aliases: product.aliases,
        basePrice: product.basePrice,
        availabilityStatus: !product.isActive
          ? "hidden"
          : product.isOutOfStock
            ? "out_of_stock"
            : "available",
        defaultComponents: product.defaultComponents,
        removableComponents: product.removableComponents,
        requiredOptions: product.requiredOptions ?? []
      })),
      modifiers: this.listModifierOptions().map((modifier) => ({
        name: modifier.name,
        aliases: modifier.aliases,
        priceDelta: modifier.priceDelta
      })),
      deliveryZones: this.listDeliveryZones().map((zone) => ({
        name: zone.name,
        aliases: zone.aliases,
        fee: zone.fee
      }))
    });
  }

  inferDeliveryZone(address: string): DeliveryZone | null {
    const resolution = resolveBarranquillaZone(address);
    if (resolution.status !== "match") {
      return null;
    }

    return this.listDeliveryZones().find((zone) => zone.id === resolution.zone.id) ?? null;
  }

  findDeliveryZonesMentioned(text: string): DeliveryZone[] {
    const resolution = resolveBarranquillaZone(text);
    if (resolution.status === "match") {
      const zone = this.listDeliveryZones().find((entry) => entry.id === resolution.zone.id);
      return zone ? [zone] : [];
    }

    if (resolution.status === "ambiguous") {
      return resolution.candidates
        .map((candidate) => this.listDeliveryZones().find((entry) => entry.id === candidate.id))
        .filter((zone): zone is DeliveryZone => Boolean(zone));
    }

    return [];
  }

  buildMenuSummary() {
    const grouped = this.listActiveProducts().reduce<Record<string, Product[]>>((acc, product) => {
      acc[product.category] ??= [];
      acc[product.category].push(product);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([category, products]) => {
        const lines = products.map((product) => `- ${product.name}: ${formatCurrency(product.basePrice)}`);
        return `${category}\n${lines.join("\n")}`;
      })
      .join("\n\n");
  }

  createProduct(payload: Pick<Product, "businessId" | "name" | "aliases" | "category" | "description" | "basePrice" | "modifierGroupIds" | "defaultComponents" | "removableComponents" | "requiredOptions" | "allowsFreeTextCustomizations">) {
    const timestamp = new Date().toISOString();
    const product: Product = {
      id: createId("prod"),
      createdAt: timestamp,
      updatedAt: timestamp,
      isActive: true,
      isOutOfStock: false,
      ...payload
    };
    demoStore.products.push(product);
    persistRuntimeStore();
    return product;
  }

  updateProduct(productId: string, payload: Partial<Product>) {
    const product = this.findProductById(productId);
    if (!product) {
      return null;
    }

    Object.assign(product, payload, { updatedAt: new Date().toISOString() });
    persistRuntimeStore();
    return product;
  }

  updateProductAvailability(productId: string, payload: Pick<Product, "isActive" | "isOutOfStock">) {
    return this.updateProduct(productId, payload);
  }

  createModifierOption(payload: Pick<ModifierOption, "businessId" | "modifierGroupId" | "name" | "aliases" | "priceDelta" | "isActive">) {
    const timestamp = new Date().toISOString();
    const modifier: ModifierOption = {
      id: createId("mod"),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...payload
    };

    demoStore.modifierOptions.push(modifier);
    const group = demoStore.modifierGroups.find((entry) => entry.id === modifier.modifierGroupId);
    if (group && !group.optionIds.includes(modifier.id)) {
      group.optionIds.push(modifier.id);
      group.updatedAt = timestamp;
    }

    persistRuntimeStore();
    return modifier;
  }

  updateModifierOption(modifierId: string, payload: Partial<ModifierOption>) {
    const modifier = this.findModifierOptionById(modifierId);
    if (!modifier) {
      return null;
    }

    Object.assign(modifier, payload, { updatedAt: new Date().toISOString() });
    persistRuntimeStore();
    return modifier;
  }

  updateModifierOptionAvailability(modifierId: string, payload: Pick<ModifierOption, "isActive">) {
    return this.updateModifierOption(modifierId, payload);
  }

  private normalizeForMatching(text: string) {
    return text
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\bkiero\b/g, "quiero")
      .replace(/\bcn\b/g, "con")
      .replace(/\bkrema\b/g, "crema")
      .replace(/\boreoo+\b/g, "oreo")
      .replace(/\bneqi\b/g, "nequi")
      .replace(/\bneky\b/g, "nequi");
  }

  private buildNormalizedCandidates(values: string[]) {
    const candidates = new Set<string>();

    for (const value of values) {
      const normalized = this.normalizeForMatching(value);
      if (!normalized) {
        continue;
      }

      candidates.add(normalized);

      const words = normalized.split(/\s+/);
      if (words.length === 2) {
        candidates.add([...words].reverse().join(" "));
      }
    }

    return [...candidates];
  }

  private toBotCatalogProduct(product: Product) {
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.basePrice,
      isActive: product.isActive,
      isOutOfStock: product.isOutOfStock,
      availabilityStatus: !product.isActive
        ? "hidden"
        : product.isOutOfStock
          ? "out_of_stock"
          : "available"
    };
  }

  private toBotCatalogModifier(modifier: ModifierOption, kind: "topping" | "adicion") {
    return {
      id: modifier.id,
      name: modifier.name,
      price: modifier.priceDelta,
      isActive: modifier.isActive,
      kind
    };
  }
}
