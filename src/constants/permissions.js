// Permission keys (the seed writes the same keys to the DB)
export const PERMISSIONS = Object.freeze({
  USERS_READ: "users.read",

  STUDENTS_READ: "students.read",
  STUDENTS_CREATE: "students.create",
  STUDENTS_UPDATE: "students.update",
  STUDENTS_DELETE: "students.delete",

  TEACHERS_READ: "teachers.read",
  TEACHERS_CREATE: "teachers.create",
  TEACHERS_UPDATE: "teachers.update",
  TEACHERS_DELETE: "teachers.delete",

  CLASSES_READ: "classes.read",
  CLASSES_CREATE: "classes.create",
  CLASSES_UPDATE: "classes.update",
  CLASSES_DELETE: "classes.delete",

  GROUPS_READ: "groups.read",
  GROUPS_CREATE: "groups.create",
  GROUPS_UPDATE: "groups.update",
  GROUPS_DELETE: "groups.delete",
  GROUPS_MANAGE_STUDENTS: "groups.manage_students",

  LEAD_SOURCES_MANAGE: "lead_sources.manage",

  // Payments
  PAYMENTS_READ: "payments.read",
  PAYMENTS_CREATE: "payments.create",
  PAYMENTS_REFUND: "payments.refund",

  INVOICES_READ: "invoices.read",
  INVOICES_CREATE: "invoices.create",
  INVOICES_UPDATE: "invoices.update",
  INVOICES_CANCEL: "invoices.cancel",

  DISCOUNTS_MANAGE: "discounts.manage",
  PAYMENT_METHODS_MANAGE: "payment_methods.manage",
  DISCOUNT_KINDS_MANAGE: "discount_kinds.manage",
  PAYMENT_SETTINGS_MANAGE: "payment_settings.manage",

  // Attendance
  ATTENDANCE_READ: "attendance.read",
  ATTENDANCE_RECORD: "attendance.record",
  ATTENDANCE_MANAGE: "attendance.manage",

  // Grades (baholash) + Rating (reyting)
  GRADES_READ: "grades.read",
  GRADES_RECORD: "grades.record",
  GRADES_MANAGE: "grades.manage",
  RATING_READ: "rating.read",
  RATING_MANAGE: "rating.manage",

  // Salaries
  SALARIES_READ: "salaries.read",
  SALARIES_MANAGE: "salaries.manage",
  SALARIES_DISTRIBUTE: "salaries.distribute",

  // Leads (CRM)
  LEADS_READ: "leads.read",
  LEADS_CREATE: "leads.create",
  LEADS_UPDATE: "leads.update",
  LEADS_DELETE: "leads.delete",
  LEADS_CONVERT: "leads.convert",
  LEAD_DIRECTIONS_MANAGE: "lead_directions.manage",
  LEAD_STATUSES_MANAGE: "lead_statuses.manage",

  // Notifications + Feedback
  NOTIFICATIONS_READ: "notifications.read",
  NOTIFICATIONS_SEND: "notifications.send",
  NOTIFICATION_TEMPLATES_MANAGE: "notification_templates.manage",
  HOLIDAYS_MANAGE: "holidays.manage",
  FEEDBACK_READ: "feedback.read",
  FEEDBACK_RESPOND: "feedback.respond",
  FEEDBACK_TYPES_MANAGE: "feedback_types.manage",

  // Admin dashboard + audit + expenses (Bo'lak 9)
  ADMIN_DASHBOARD_READ: "admin_dashboard.read",
  EXPENSES_READ: "expenses.read",
  EXPENSES_MANAGE: "expenses.manage",
  ACTIVITY_LOGS_READ: "activity_logs.read",
});

// Human-readable labels (used by the seed)
export const PERMISSION_LABELS = {
  [PERMISSIONS.USERS_READ]: { label: "Foydalanuvchilarni ko'rish", group: "users" },

  [PERMISSIONS.STUDENTS_READ]: { label: "O'quvchilarni ko'rish", group: "students" },
  [PERMISSIONS.STUDENTS_CREATE]: { label: "O'quvchilarni yaratish", group: "students" },
  [PERMISSIONS.STUDENTS_UPDATE]: { label: "O'quvchilarni tahrirlash", group: "students" },
  [PERMISSIONS.STUDENTS_DELETE]: { label: "O'quvchilarni o'chirish", group: "students" },

  [PERMISSIONS.TEACHERS_READ]: { label: "O'qituvchilarni ko'rish", group: "teachers" },
  [PERMISSIONS.TEACHERS_CREATE]: { label: "O'qituvchilarni yaratish", group: "teachers" },
  [PERMISSIONS.TEACHERS_UPDATE]: { label: "O'qituvchilarni tahrirlash", group: "teachers" },
  [PERMISSIONS.TEACHERS_DELETE]: { label: "O'qituvchilarni o'chirish", group: "teachers" },

  [PERMISSIONS.CLASSES_READ]: { label: "Sinflarni ko'rish", group: "classes" },
  [PERMISSIONS.CLASSES_CREATE]: { label: "Sinflarni yaratish", group: "classes" },
  [PERMISSIONS.CLASSES_UPDATE]: { label: "Sinflarni tahrirlash", group: "classes" },
  [PERMISSIONS.CLASSES_DELETE]: { label: "Sinflarni o'chirish", group: "classes" },

  [PERMISSIONS.GROUPS_READ]: { label: "Guruhlarni ko'rish", group: "groups" },
  [PERMISSIONS.GROUPS_CREATE]: { label: "Guruhlarni yaratish", group: "groups" },
  [PERMISSIONS.GROUPS_UPDATE]: { label: "Guruhlarni tahrirlash", group: "groups" },
  [PERMISSIONS.GROUPS_DELETE]: { label: "Guruhlarni o'chirish", group: "groups" },
  [PERMISSIONS.GROUPS_MANAGE_STUDENTS]: {
    label: "Guruh o'quvchilarini boshqarish",
    group: "groups",
  },

  [PERMISSIONS.LEAD_SOURCES_MANAGE]: {
    label: "Lead manbalarini boshqarish",
    group: "lead_sources",
  },

  [PERMISSIONS.PAYMENTS_READ]: { label: "To'lovlarni ko'rish", group: "payments" },
  [PERMISSIONS.PAYMENTS_CREATE]: { label: "To'lov qabul qilish", group: "payments" },
  [PERMISSIONS.PAYMENTS_REFUND]: { label: "To'lovni qaytarish", group: "payments" },

  [PERMISSIONS.INVOICES_READ]: { label: "Hisoblarni ko'rish", group: "invoices" },
  [PERMISSIONS.INVOICES_CREATE]: { label: "Hisob yaratish", group: "invoices" },
  [PERMISSIONS.INVOICES_UPDATE]: { label: "Hisobni tahrirlash", group: "invoices" },
  [PERMISSIONS.INVOICES_CANCEL]: { label: "Hisobni bekor qilish", group: "invoices" },

  [PERMISSIONS.DISCOUNTS_MANAGE]: {
    label: "Chegirmalarni boshqarish",
    group: "discounts",
  },
  [PERMISSIONS.PAYMENT_METHODS_MANAGE]: {
    label: "To'lov usullarini boshqarish",
    group: "payment_methods",
  },
  [PERMISSIONS.DISCOUNT_KINDS_MANAGE]: {
    label: "Chegirma turlarini boshqarish",
    group: "discount_kinds",
  },
  [PERMISSIONS.PAYMENT_SETTINGS_MANAGE]: {
    label: "To'lov sozlamalarini boshqarish",
    group: "payment_settings",
  },

  [PERMISSIONS.ATTENDANCE_READ]: { label: "Davomatni ko'rish", group: "attendance" },
  [PERMISSIONS.ATTENDANCE_RECORD]: { label: "Davomatni belgilash", group: "attendance" },
  [PERMISSIONS.ATTENDANCE_MANAGE]: { label: "Davomatni boshqarish", group: "attendance" },

  [PERMISSIONS.GRADES_READ]: { label: "Baholarni ko'rish", group: "grades" },
  [PERMISSIONS.GRADES_RECORD]: { label: "Baho qo'yish", group: "grades" },
  [PERMISSIONS.GRADES_MANAGE]: { label: "Baholashni boshqarish", group: "grades" },
  [PERMISSIONS.RATING_READ]: { label: "Reytingni ko'rish", group: "rating" },
  [PERMISSIONS.RATING_MANAGE]: { label: "Reyting sozlamalarini boshqarish", group: "rating" },

  [PERMISSIONS.SALARIES_READ]: { label: "Maoshlarni ko'rish", group: "salaries" },
  [PERMISSIONS.SALARIES_MANAGE]: {
    label: "Maoshlarni boshqarish",
    group: "salaries",
  },
  [PERMISSIONS.SALARIES_DISTRIBUTE]: {
    label: "Maosh to'lab berish",
    group: "salaries",
  },

  [PERMISSIONS.LEADS_READ]: { label: "Lidlarni ko'rish", group: "leads" },
  [PERMISSIONS.LEADS_CREATE]: { label: "Lid yaratish", group: "leads" },
  [PERMISSIONS.LEADS_UPDATE]: { label: "Lidni tahrirlash", group: "leads" },
  [PERMISSIONS.LEADS_DELETE]: { label: "Lidni o'chirish", group: "leads" },
  [PERMISSIONS.LEADS_CONVERT]: {
    label: "Lidni o'quvchiga aylantirish",
    group: "leads",
  },
  [PERMISSIONS.LEAD_DIRECTIONS_MANAGE]: {
    label: "Lid yo'nalishlarini boshqarish",
    group: "lead_directions",
  },
  [PERMISSIONS.LEAD_STATUSES_MANAGE]: {
    label: "Lid statuslarini boshqarish",
    group: "lead_statuses",
  },

  [PERMISSIONS.NOTIFICATIONS_READ]: {
    label: "Bildirishnomalarni ko'rish",
    group: "notifications",
  },
  [PERMISSIONS.NOTIFICATIONS_SEND]: {
    label: "Bildirishnoma yuborish",
    group: "notifications",
  },
  [PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE]: {
    label: "Bildirishnoma shablonlarini boshqarish",
    group: "notifications",
  },
  [PERMISSIONS.HOLIDAYS_MANAGE]: {
    label: "Bayramlarni boshqarish",
    group: "holidays",
  },
  [PERMISSIONS.FEEDBACK_READ]: {
    label: "Feedback'larni ko'rish",
    group: "feedback",
  },
  [PERMISSIONS.FEEDBACK_RESPOND]: {
    label: "Feedback'ga javob berish",
    group: "feedback",
  },
  [PERMISSIONS.FEEDBACK_TYPES_MANAGE]: {
    label: "Feedback turlarini boshqarish",
    group: "feedback",
  },

  [PERMISSIONS.ADMIN_DASHBOARD_READ]: {
    label: "Boshqaruv panelini ko'rish",
    group: "admin",
  },
  [PERMISSIONS.EXPENSES_READ]: {
    label: "Xarajatlarni ko'rish",
    group: "expenses",
  },
  [PERMISSIONS.EXPENSES_MANAGE]: {
    label: "Xarajatlarni boshqarish",
    group: "expenses",
  },
  [PERMISSIONS.ACTIVITY_LOGS_READ]: {
    label: "Faoliyat loglarini ko'rish",
    group: "audit",
  },
};
