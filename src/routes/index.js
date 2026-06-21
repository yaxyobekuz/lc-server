import { Router } from "express";
import authRouter from "../modules/auth/auth.routes.js";
import usersRouter from "../modules/users/users.routes.js";
import archiveReasonsRouter from "../modules/archiveReasons/archiveReasons.routes.js";
import leadsRouter from "../modules/leads/leads.routes.js";
import leadOptionsRouter from "../modules/leadOptions/leadOptions.routes.js";
import groupsRouter from "../modules/groups/groups.routes.js";
import attendanceRouter from "../modules/attendance/attendance.routes.js";
import teacherAttendanceRouter from "../modules/teacherAttendance/teacherAttendance.routes.js";
import attendanceExemptionsRouter from "../modules/attendanceExemptions/attendanceExemptions.routes.js";
import attendanceSettingsRouter from "../modules/attendanceSettings/attendanceSettings.routes.js";
import gradesRouter from "../modules/grades/grades.routes.js";
import notificationsRouter from "../modules/notifications/notifications.routes.js";
import systemNotificationsRouter from "../modules/systemNotifications/systemNotifications.routes.js";
import notificationTemplatesRouter from "../modules/notificationTemplates/notificationTemplates.routes.js";
import holidaysRouter from "../modules/holidays/holidays.routes.js";
import feedbackRouter from "../modules/feedback/feedback.routes.js";
import feedbackTypesRouter from "../modules/feedbackTypes/feedbackTypes.routes.js";
import botAuthRouter from "../modules/botAuth/botAuth.routes.js";
import activityLogsRouter from "../modules/activityLogs/activityLogs.routes.js";
import adminDashboardRouter from "../modules/adminDashboard/adminDashboard.routes.js";
import searchRouter from "../modules/search/search.routes.js";
import financeRouter from "../modules/finance/finance.routes.js";
import depositsRouter from "../modules/deposits/deposits.routes.js";
import teacherSalaryRouter from "../modules/teacherSalary/teacherSalary.routes.js";
import financeReportRouter from "../modules/financeReport/financeReport.routes.js";

const router = Router();

router.get("/health", (_req, res) =>
  res.json({ success: true, message: "Server ishlayapti" }),
);

router.use("/auth", authRouter);
router.use("/search", searchRouter);
router.use("/users", usersRouter);
router.use("/archive-reasons", archiveReasonsRouter);
router.use("/leads", leadsRouter);
router.use("/lead-options", leadOptionsRouter);
router.use("/groups", groupsRouter);

// Attendance subsystem
router.use("/attendance", attendanceRouter);
router.use("/teacher-attendance", teacherAttendanceRouter);
router.use("/attendance-exemptions", attendanceExemptionsRouter);
router.use("/attendance-settings", attendanceSettingsRouter);

// Grading subsystem
router.use("/grades", gradesRouter);

// Communication: Notifications + Feedback
router.use("/notifications", notificationsRouter);
router.use("/system-notifications", systemNotificationsRouter);
router.use("/notification-templates", notificationTemplatesRouter);
router.use("/holidays", holidaysRouter);
router.use("/feedback", feedbackRouter);
router.use("/feedback-types", feedbackTypesRouter);

// Bot mini-app authentication (Telegram WebApp initData)
router.use("/bot-auth", botAuthRouter);

// Admin / boshqaruv paneli
router.use("/activity-logs", activityLogsRouter);
router.use("/admin-dashboard", adminDashboardRouter);

// Finance subsystem (Moliya)
router.use("/finance", financeRouter);
router.use("/deposits", depositsRouter);
router.use("/teacher-salary", teacherSalaryRouter);
router.use("/finance-report", financeReportRouter);

export default router;
