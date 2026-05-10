import { Router } from "express";
import authRouter from "../modules/auth/auth.routes.js";
import usersRouter from "../modules/users/users.routes.js";
import groupsRouter from "../modules/groups/groups.routes.js";
import leadSourcesRouter from "../modules/leadSources/leadSources.routes.js";
import paymentMethodsRouter from "../modules/paymentMethods/paymentMethods.routes.js";
import discountKindsRouter from "../modules/discountKinds/discountKinds.routes.js";
import discountsRouter from "../modules/discounts/discounts.routes.js";
import invoicesRouter from "../modules/invoices/invoices.routes.js";
import paymentsRouter from "../modules/payments/payments.routes.js";
import paymentSettingsRouter from "../modules/paymentSettings/paymentSettings.routes.js";
import paymentReportsRouter from "../modules/paymentReports/paymentReports.routes.js";
import attendanceRouter from "../modules/attendance/attendance.routes.js";
import attendanceExemptionsRouter from "../modules/attendanceExemptions/attendanceExemptions.routes.js";
import attendanceSettingsRouter from "../modules/attendanceSettings/attendanceSettings.routes.js";
import salariesRouter from "../modules/salaries/salaries.routes.js";
import teacherGroupRatesRouter from "../modules/teacherGroupRates/teacherGroupRates.routes.js";
import salarySettingsRouter from "../modules/salarySettings/salarySettings.routes.js";
import leadsRouter from "../modules/leads/leads.routes.js";
import leadDirectionsRouter from "../modules/leadDirections/leadDirections.routes.js";
import leadStatusesRouter from "../modules/leadStatuses/leadStatuses.routes.js";
import leadSettingsRouter from "../modules/leadSettings/leadSettings.routes.js";
import notificationsRouter from "../modules/notifications/notifications.routes.js";
import notificationTemplatesRouter from "../modules/notificationTemplates/notificationTemplates.routes.js";
import holidaysRouter from "../modules/holidays/holidays.routes.js";
import feedbackRouter from "../modules/feedback/feedback.routes.js";
import feedbackTypesRouter from "../modules/feedbackTypes/feedbackTypes.routes.js";
import botAuthRouter from "../modules/botAuth/botAuth.routes.js";
import expensesRouter from "../modules/expenses/expenses.routes.js";
import activityLogsRouter from "../modules/activityLogs/activityLogs.routes.js";
import adminDashboardRouter from "../modules/adminDashboard/adminDashboard.routes.js";

const router = Router();

router.get("/health", (_req, res) =>
  res.json({ success: true, message: "Server ishlayapti" }),
);

router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/groups", groupsRouter);
router.use("/lead-sources", leadSourcesRouter);

// Payments subsystem
router.use("/payment-methods", paymentMethodsRouter);
router.use("/discount-kinds", discountKindsRouter);
router.use("/discounts", discountsRouter);
router.use("/invoices", invoicesRouter);
router.use("/payments", paymentsRouter);
router.use("/payment-settings", paymentSettingsRouter);
router.use("/payment-reports", paymentReportsRouter);

// Attendance subsystem
router.use("/attendance", attendanceRouter);
router.use("/attendance-exemptions", attendanceExemptionsRouter);
router.use("/attendance-settings", attendanceSettingsRouter);

// Salaries subsystem
router.use("/salaries", salariesRouter);
router.use("/teacher-group-rates", teacherGroupRatesRouter);
router.use("/salary-settings", salarySettingsRouter);

// Leads / CRM subsystem
router.use("/leads", leadsRouter);
router.use("/lead-directions", leadDirectionsRouter);
router.use("/lead-statuses", leadStatusesRouter);
router.use("/lead-settings", leadSettingsRouter);

// Communication: Notifications + Feedback
router.use("/notifications", notificationsRouter);
router.use("/notification-templates", notificationTemplatesRouter);
router.use("/holidays", holidaysRouter);
router.use("/feedback", feedbackRouter);
router.use("/feedback-types", feedbackTypesRouter);

// Bot mini-app authentication (Telegram WebApp initData)
router.use("/bot-auth", botAuthRouter);

// Admin / boshqaruv paneli
router.use("/expenses", expensesRouter);
router.use("/activity-logs", activityLogsRouter);
router.use("/admin-dashboard", adminDashboardRouter);

export default router;
