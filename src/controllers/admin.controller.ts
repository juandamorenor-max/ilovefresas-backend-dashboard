import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http.js";
import { AdminService } from "../services/admin.service.js";
import { CatalogService } from "../services/catalog.service.js";
import { OrderService } from "../services/order.service.js";
import { BusinessService } from "../services/business.service.js";
import { AdminDashboardService } from "../services/admin-dashboard.service.js";
import { ManualQaService } from "../services/manual-qa.service.js";

export class AdminController {
  constructor(
    private readonly orderService = new OrderService(),
    private readonly catalogService = new CatalogService(),
    private readonly adminService = new AdminService(),
    private readonly businessService = new BusinessService(),
    private readonly adminDashboardService = new AdminDashboardService(),
    private readonly manualQaService = new ManualQaService()
  ) {}

  listOrders(_request: Request, response: Response) {
    response.json(this.orderService.listOrders());
  }

  getOrder(request: Request, response: Response) {
    const order = this.orderService.findOrder(this.getParam(request, "id"));
    if (!order) {
      throw new HttpError(404, "Order not found");
    }

    response.json(order);
  }

  updateOrderStatus(request: Request, response: Response) {
    const updated = this.orderService.updateOrderStatus(
      this.getParam(request, "id"),
      request.body.status,
      request.body.internalNotes
    );

    if (!updated) {
      throw new HttpError(404, "Order not found");
    }

    response.json(updated);
  }

  listDashboardOrders(_request: Request, response: Response) {
    response.json(this.adminDashboardService.listDashboardOrders());
  }

  getDashboardOrder(request: Request, response: Response) {
    const order = this.adminDashboardService.getDashboardOrder(this.getParam(request, "id"));
    if (!order) {
      throw new HttpError(404, "Order not found");
    }

    response.json(order);
  }

  updateDashboardOrder(request: Request, response: Response) {
    const order = this.adminDashboardService.updateDashboardOrder(
      this.getParam(request, "id"),
      request.body
    );
    if (!order) {
      throw new HttpError(404, "Order not found");
    }

    response.json(order);
  }

  updateDashboardOrderStatus(request: Request, response: Response) {
    const order = this.adminDashboardService.updateDashboardOrderStatus(
      this.getParam(request, "id"),
      String(request.body.status ?? ""),
      request.body.internalNotes
    );
    if (!order) {
      throw new HttpError(404, "Order not found or invalid status");
    }

    response.json(order);
  }

  async markDashboardOrderDispatchNotified(
    request: Request,
    response: Response,
    next: NextFunction
  ) {
    try {
      const order = await this.adminDashboardService.markDispatchNotified(this.getParam(request, "id"));
      if (!order) {
        throw new HttpError(404, "Order not found");
      }

      response.json(order);
    } catch (error) {
      next(error);
    }
  }

  async confirmDashboardOrderAndNotify(
    request: Request,
    response: Response,
    next: NextFunction
  ) {
    try {
      const order = await this.adminDashboardService.confirmOrderAndNotify(
        this.getParam(request, "id"),
        {
          deliveryFee: request.body.deliveryFee === undefined ? undefined : Number(request.body.deliveryFee),
          note: request.body.note === undefined ? undefined : String(request.body.note)
        }
      );
      if (!order) {
        throw new HttpError(404, "Order not found");
      }

      response.json(order);
    } catch (error) {
      next(error);
    }
  }

  listDashboardConversations(_request: Request, response: Response) {
    response.json(this.adminDashboardService.listDashboardConversations());
  }

  getDashboardConversation(request: Request, response: Response) {
    const conversation = this.adminDashboardService.getDashboardConversation(
      this.getParam(request, "id")
    );
    if (!conversation) {
      throw new HttpError(404, "Conversation not found");
    }

    response.json(conversation);
  }

  async sendDashboardConversationMessage(
    request: Request,
    response: Response,
    next: NextFunction
  ) {
    try {
      const conversation = await this.adminDashboardService.sendConversationMessage(
        this.getParam(request, "id"),
        String(request.body.text ?? "")
      );
      if (!conversation) {
        throw new HttpError(404, "Conversation not found");
      }

      response.json(conversation);
    } catch (error) {
      next(error);
    }
  }

  setDashboardConversationBotPause(request: Request, response: Response) {
    const conversation = this.adminDashboardService.setConversationBotPause(
      this.getParam(request, "id"),
      {
        paused: Boolean(request.body.paused),
        minutes: request.body.minutes === undefined ? undefined : Number(request.body.minutes),
        reason: request.body.reason === undefined ? undefined : String(request.body.reason)
      }
    );

    if (!conversation) {
      throw new HttpError(404, "Conversation not found");
    }

    response.json(conversation);
  }

  setGlobalBotPause(request: Request, response: Response) {
    response.json(this.adminDashboardService.setGlobalBotPause({
      paused: Boolean(request.body.paused),
      minutes: request.body.minutes === undefined ? undefined : Number(request.body.minutes),
      reason: request.body.reason === undefined ? undefined : String(request.body.reason)
    }));
  }

  async listManualQaEvaluations(_request: Request, response: Response, next: NextFunction) {
    try {
      response.json(await this.manualQaService.listEvaluations());
    } catch (error) {
      next(error);
    }
  }

  async saveManualQaEvaluation(request: Request, response: Response, next: NextFunction) {
    try {
      const status = String(request.body.status ?? "");
      if (status !== "success" && status !== "failure") {
        throw new HttpError(400, "Invalid manual QA status");
      }

      const evaluation = await this.manualQaService.saveEvaluation({
        conversationId: String(request.body.conversationId ?? ""),
        conversationName:
          request.body.conversationName === undefined ? null : String(request.body.conversationName),
        customerPhone: request.body.customerPhone === undefined ? null : String(request.body.customerPhone),
        orderId: request.body.orderId === undefined ? null : String(request.body.orderId),
        status,
        comments: request.body.comments === undefined ? "" : String(request.body.comments),
        reviewer: request.body.reviewer === undefined ? null : String(request.body.reviewer),
        conversationSnapshot: request.body.conversationSnapshot,
        orderSnapshot: request.body.orderSnapshot
      });

      response.status(201).json(evaluation);
    } catch (error) {
      next(error);
    }
  }

  async getManualQaReport(_request: Request, response: Response, next: NextFunction) {
    try {
      response.json(await this.manualQaService.buildReport());
    } catch (error) {
      next(error);
    }
  }

  listProducts(_request: Request, response: Response) {
    response.json(this.catalogService.listProducts());
  }

  listModifierOptions(_request: Request, response: Response) {
    response.json(this.catalogService.listModifierOptionsForAdmin());
  }

  createProduct(request: Request, response: Response) {
    const business = this.businessService.getDefaultBusiness();
    const created = this.catalogService.createProduct({
      businessId: business.id,
      name: this.requiredText(request.body.name, "name"),
      aliases: this.stringArray(request.body.aliases),
      category: this.requiredText(request.body.category, "category"),
      description: this.optionalText(request.body.description),
      basePrice: this.positiveInteger(request.body.basePrice, "basePrice"),
      modifierGroupIds: this.stringArray(request.body.modifierGroupIds),
      defaultComponents: this.stringArray(request.body.defaultComponents),
      removableComponents: this.stringArray(request.body.removableComponents),
      requiredOptions: Array.isArray(request.body.requiredOptions) ? request.body.requiredOptions : [],
      allowsFreeTextCustomizations: Boolean(request.body.allowsFreeTextCustomizations ?? true)
    });

    response.status(201).json(created);
  }

  updateProduct(request: Request, response: Response) {
    const updated = this.catalogService.updateProduct(
      this.getParam(request, "id"),
      this.productPatch(request.body)
    );
    if (!updated) {
      throw new HttpError(404, "Product not found");
    }

    response.json(updated);
  }

  updateProductAvailability(request: Request, response: Response) {
    const updated = this.catalogService.updateProductAvailability(this.getParam(request, "id"), {
      isActive: this.requiredBoolean(request.body.isActive, "isActive"),
      isOutOfStock: this.requiredBoolean(request.body.isOutOfStock, "isOutOfStock")
    });

    if (!updated) {
      throw new HttpError(404, "Product not found");
    }

    response.json(updated);
  }

  createModifierOption(request: Request, response: Response) {
    const business = this.businessService.getDefaultBusiness();
    const created = this.catalogService.createModifierOption({
      businessId: business.id,
      modifierGroupId: this.optionalText(request.body.modifierGroupId) || "mg_toppings",
      name: this.requiredText(request.body.name, "name"),
      aliases: this.stringArray(request.body.aliases),
      priceDelta: this.positiveInteger(request.body.priceDelta, "priceDelta"),
      isActive: request.body.isActive === undefined
        ? true
        : this.requiredBoolean(request.body.isActive, "isActive")
    });

    response.status(201).json(created);
  }

  updateModifierOption(request: Request, response: Response) {
    const updated = this.catalogService.updateModifierOption(
      this.getParam(request, "id"),
      this.modifierPatch(request.body)
    );
    if (!updated) {
      throw new HttpError(404, "Modifier option not found");
    }

    response.json(updated);
  }

  updateModifierOptionAvailability(request: Request, response: Response) {
    const updated = this.catalogService.updateModifierOptionAvailability(this.getParam(request, "id"), {
      isActive: this.requiredBoolean(request.body.isActive, "isActive")
    });

    if (!updated) {
      throw new HttpError(404, "Modifier option not found");
    }

    response.json(updated);
  }

  getBusinessStatus(_request: Request, response: Response) {
    response.json(this.adminService.getBusinessStatus());
  }

  listBusinessHours(_request: Request, response: Response) {
    response.json(this.adminService.listBusinessHours());
  }

  updateBusinessHour(request: Request, response: Response) {
    const updated = this.adminService.updateBusinessHour(this.getParam(request, "id"), request.body);
    if (!updated) {
      throw new HttpError(404, "Business hour not found");
    }

    response.json(updated);
  }

  listPaymentMethods(_request: Request, response: Response) {
    response.json(this.adminService.listPaymentMethods());
  }

  updatePaymentMethod(request: Request, response: Response) {
    const updated = this.adminService.updatePaymentMethod(this.getParam(request, "id"), request.body);
    if (!updated) {
      throw new HttpError(404, "Payment method not found");
    }

    response.json(updated);
  }

  updateBusinessStatus(request: Request, response: Response) {
    response.json(this.adminService.updateBusinessStatus(request.body));
  }

  listSpecialClosures(_request: Request, response: Response) {
    response.json(this.adminService.listSpecialClosures());
  }

  createSpecialClosure(request: Request, response: Response) {
    const business = this.businessService.getDefaultBusiness();
    const closure = this.adminService.createSpecialClosure({
      businessId: business.id,
      date: request.body.date,
      reason: request.body.reason
    });

    response.status(201).json(closure);
  }

  deleteSpecialClosure(request: Request, response: Response) {
    const deleted = this.adminService.deleteSpecialClosure(this.getParam(request, "id"));
    if (!deleted) {
      throw new HttpError(404, "Special closure not found");
    }

    response.status(204).send();
  }

  private getParam(request: Request, key: string) {
    return String(request.params[key] ?? "");
  }

  private requiredText(value: unknown, field: string) {
    if (typeof value !== "string" || !value.trim()) {
      throw new HttpError(400, `${field} is required`);
    }

    return value.trim();
  }

  private optionalText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }

  private positiveInteger(value: unknown, field: string) {
    const numberValue = Number(value);
    if (!Number.isInteger(numberValue) || numberValue <= 0) {
      throw new HttpError(400, `${field} must be a positive integer`);
    }

    return numberValue;
  }

  private requiredBoolean(value: unknown, field: string) {
    if (typeof value !== "boolean") {
      throw new HttpError(400, `${field} must be boolean`);
    }

    return value;
  }

  private stringArray(value: unknown) {
    if (value === undefined) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new HttpError(400, "Expected array value");
    }

    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  private productPatch(body: Record<string, unknown>) {
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = this.requiredText(body.name, "name");
    if (body.category !== undefined) patch.category = this.requiredText(body.category, "category");
    if (body.description !== undefined) patch.description = this.optionalText(body.description);
    if (body.basePrice !== undefined) patch.basePrice = this.positiveInteger(body.basePrice, "basePrice");
    if (body.aliases !== undefined) patch.aliases = this.stringArray(body.aliases);
    if (body.modifierGroupIds !== undefined) patch.modifierGroupIds = this.stringArray(body.modifierGroupIds);
    if (body.defaultComponents !== undefined) patch.defaultComponents = this.stringArray(body.defaultComponents);
    if (body.removableComponents !== undefined) patch.removableComponents = this.stringArray(body.removableComponents);
    if (body.isActive !== undefined) patch.isActive = this.requiredBoolean(body.isActive, "isActive");
    if (body.isOutOfStock !== undefined) patch.isOutOfStock = this.requiredBoolean(body.isOutOfStock, "isOutOfStock");
    return patch;
  }

  private modifierPatch(body: Record<string, unknown>) {
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = this.requiredText(body.name, "name");
    if (body.aliases !== undefined) patch.aliases = this.stringArray(body.aliases);
    if (body.priceDelta !== undefined) patch.priceDelta = this.positiveInteger(body.priceDelta, "priceDelta");
    if (body.modifierGroupId !== undefined) patch.modifierGroupId = this.requiredText(body.modifierGroupId, "modifierGroupId");
    if (body.isActive !== undefined) patch.isActive = this.requiredBoolean(body.isActive, "isActive");
    return patch;
  }
}
