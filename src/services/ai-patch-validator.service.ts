import type { ModifierOption, OrderDraft, Product } from "../types/index.js";

export interface AIPatchValidationIssue {
  code: string;
  severity: "info" | "warning" | "critical";
  detail: string;
}

export class AIPatchValidatorService {
  validateDraftIntegrity(input: {
    draft: OrderDraft;
    products: Product[];
    modifiers: ModifierOption[];
  }): AIPatchValidationIssue[] {
    const issues: AIPatchValidationIssue[] = [];
    const productsById = new Map(input.products.map((product) => [product.id, product]));
    const modifiersByName = new Map(
      input.modifiers.map((modifier) => [this.normalize(modifier.name), modifier])
    );

    for (const item of input.draft.items) {
      const product = productsById.get(item.productId);
      if (!product) {
        issues.push({
          code: "unknown_product_id",
          severity: "critical",
          detail: `Item ${item.id} references unknown product ${item.productId}.`
        });
        continue;
      }

      if (item.quantity <= 0) {
        issues.push({
          code: "invalid_quantity",
          severity: "critical",
          detail: `Item ${item.id} has invalid quantity ${item.quantity}.`
        });
      }

      for (const requiredOption of product.requiredOptions ?? []) {
        if (!requiredOption.required) {
          continue;
        }
        const selected = item.selectedOptions?.[requiredOption.key] ?? [];
        const pendingExists = input.draft.pendingSelections.some(
          (selection) =>
            selection.type === "required_option" &&
            selection.blocking &&
            (selection.targetItemId === item.id || selection.targetProductId === product.id)
        );
        if (selected.length < requiredOption.minSelections && !pendingExists) {
          issues.push({
            code: "missing_required_option_state",
            severity: "critical",
            detail: `Item ${item.id} (${product.name}) is missing required option ${requiredOption.label} without a blocking pending selection.`
          });
        }
      }

      for (const component of item.components ?? []) {
        if (component.type === "added" && !modifiersByName.has(this.normalize(component.name))) {
          issues.push({
            code: "unknown_added_component",
            severity: "warning",
            detail: `Item ${item.id} has added component not found in modifier catalog: ${component.name}.`
          });
        }
      }
    }

    const itemIds = new Set(input.draft.items.map((item) => item.id));
    for (const selection of input.draft.pendingSelections) {
      if (selection.targetItemId && !itemIds.has(selection.targetItemId)) {
        issues.push({
          code: "orphan_pending_selection",
          severity: "warning",
          detail: `Pending selection ${selection.id} points to missing item ${selection.targetItemId}.`
        });
      }
    }

    return issues;
  }

  private normalize(value: string) {
    return value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }
}
