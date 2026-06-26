import { Router, type NextFunction, type Request, type Response } from "express";
import { AdminController } from "../controllers/admin.controller.js";
import { DashboardAuthService } from "../services/dashboard-auth.service.js";

const controller = new AdminController();
const dashboardAuth = new DashboardAuthService();

export const adminRouter = Router();

adminRouter.get("/admin/session", controller.getDashboardSession.bind(controller));
adminRouter.post("/admin/session/login", controller.loginDashboard.bind(controller));
adminRouter.post("/admin/session/logout", controller.logoutDashboard.bind(controller));

adminRouter.use((request: Request, response: Response, next: NextFunction) => {
  if (!dashboardAuth.isEnabled() || dashboardAuth.getSession(request).authenticated) {
    next();
    return;
  }

  response.status(401).json({ error: "Dashboard session required" });
});

adminRouter.get("/admin/dashboard/orders", controller.listDashboardOrders.bind(controller));
adminRouter.get("/admin/dashboard/orders/:id", controller.getDashboardOrder.bind(controller));
adminRouter.patch("/admin/dashboard/orders/:id", controller.updateDashboardOrder.bind(controller));
adminRouter.patch(
  "/admin/dashboard/orders/:id/status",
  controller.updateDashboardOrderStatus.bind(controller)
);
adminRouter.post(
  "/admin/dashboard/orders/:id/notify-dispatched",
  controller.markDashboardOrderDispatchNotified.bind(controller)
);
adminRouter.post(
  "/admin/dashboard/orders/:id/confirm-and-notify",
  controller.confirmDashboardOrderAndNotify.bind(controller)
);
adminRouter.get(
  "/admin/dashboard/conversations",
  controller.listDashboardConversations.bind(controller)
);
adminRouter.post(
  "/admin/dashboard/reset-operational-data",
  controller.resetDashboardOperationalData.bind(controller)
);
adminRouter.post(
  "/admin/dashboard/reset-conversations",
  controller.resetDashboardConversationData.bind(controller)
);
adminRouter.get(
  "/admin/dashboard/conversations/:id",
  controller.getDashboardConversation.bind(controller)
);
adminRouter.post(
  "/admin/dashboard/conversations/:id/messages",
  controller.sendDashboardConversationMessage.bind(controller)
);
adminRouter.patch(
  "/admin/dashboard/conversations/:id/bot-pause",
  controller.setDashboardConversationBotPause.bind(controller)
);
adminRouter.get("/admin/dashboard/products", controller.listProducts.bind(controller));
adminRouter.get("/admin/dashboard/modifiers", controller.listModifierOptions.bind(controller));
adminRouter.get("/admin/dashboard/bot-catalog", controller.getBotAvailableCatalog.bind(controller));
adminRouter.get("/admin/dashboard/business-status", controller.getBusinessStatus.bind(controller));
adminRouter.get("/admin/dashboard/business-hours", controller.listBusinessHours.bind(controller));
adminRouter.get("/admin/dashboard/payment-methods", controller.listPaymentMethods.bind(controller));
adminRouter.patch("/admin/dashboard/bot-pause", controller.setGlobalBotPause.bind(controller));
adminRouter.get(
  "/admin/dashboard/manual-qa/evaluations",
  controller.listManualQaEvaluations.bind(controller)
);
adminRouter.post(
  "/admin/dashboard/manual-qa/evaluations",
  controller.saveManualQaEvaluation.bind(controller)
);
adminRouter.get(
  "/admin/dashboard/manual-qa/report",
  controller.getManualQaReport.bind(controller)
);
adminRouter.get(
  "/admin/dashboard/accounting/dispatched-orders",
  controller.listAccountingDispatchedOrders.bind(controller)
);
adminRouter.get(
  "/admin/dashboard/accounting/dispatched-orders.csv",
  controller.exportAccountingDispatchedOrdersCsv.bind(controller)
);

adminRouter.get("/admin/orders", controller.listOrders.bind(controller));
adminRouter.get("/admin/orders/:id", controller.getOrder.bind(controller));
adminRouter.patch("/admin/orders/:id", controller.updateDashboardOrder.bind(controller));
adminRouter.patch("/admin/orders/:id/status", controller.updateOrderStatus.bind(controller));
adminRouter.post(
  "/admin/orders/:id/notify-dispatched",
  controller.markDashboardOrderDispatchNotified.bind(controller)
);

adminRouter.get("/admin/products", controller.listProducts.bind(controller));
adminRouter.post("/admin/products", controller.createProduct.bind(controller));
adminRouter.patch("/admin/products/:id", controller.updateProduct.bind(controller));
adminRouter.patch(
  "/admin/products/:id/availability",
  controller.updateProductAvailability.bind(controller)
);

adminRouter.get("/admin/modifiers", controller.listModifierOptions.bind(controller));
adminRouter.post("/admin/modifiers", controller.createModifierOption.bind(controller));
adminRouter.patch("/admin/modifiers/:id", controller.updateModifierOption.bind(controller));
adminRouter.patch(
  "/admin/modifiers/:id/availability",
  controller.updateModifierOptionAvailability.bind(controller)
);

adminRouter.get("/admin/business-status", controller.getBusinessStatus.bind(controller));
adminRouter.patch("/admin/business-status", controller.updateBusinessStatus.bind(controller));
adminRouter.get("/admin/business-hours", controller.listBusinessHours.bind(controller));
adminRouter.patch("/admin/business-hours/:id", controller.updateBusinessHour.bind(controller));
adminRouter.get("/admin/payment-methods", controller.listPaymentMethods.bind(controller));
adminRouter.patch("/admin/payment-methods/:id", controller.updatePaymentMethod.bind(controller));

adminRouter.get("/admin/special-closures", controller.listSpecialClosures.bind(controller));
adminRouter.post("/admin/special-closures", controller.createSpecialClosure.bind(controller));
adminRouter.delete(
  "/admin/special-closures/:id",
  controller.deleteSpecialClosure.bind(controller)
);
