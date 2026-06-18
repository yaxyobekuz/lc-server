// Permission keys (the seed writes the same keys to the DB)
export const PERMISSIONS = Object.freeze({
  USERS_READ: "users.read",
  ARCHIVE_REASONS_MANAGE: "archive_reasons.manage",

  LEADS_READ: "leads.read",
  LEADS_MANAGE: "leads.manage",

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

  // Notifications + Feedback
  NOTIFICATIONS_READ: "notifications.read",
  NOTIFICATIONS_SEND: "notifications.send",
  NOTIFICATION_TEMPLATES_MANAGE: "notification_templates.manage",
  HOLIDAYS_MANAGE: "holidays.manage",
  FEEDBACK_READ: "feedback.read",
  FEEDBACK_RESPOND: "feedback.respond",
  FEEDBACK_TYPES_MANAGE: "feedback_types.manage",

  // Admin dashboard + audit (Bo'lak 9)
  ADMIN_DASHBOARD_READ: "admin_dashboard.read",
  ACTIVITY_LOGS_READ: "activity_logs.read",

  // Finance (Moliya)
  FINANCE_READ: "finance.read",
  FINANCE_PAY: "finance.pay",
  FINANCE_MANAGE: "finance.manage",

  // Teacher salary (O'qituvchi maoshlari)
  SALARY_READ: "salary.read",
  SALARY_PAY: "salary.pay",
});

// Human-readable labels (used by the seed)
export const PERMISSION_LABELS = {
  [PERMISSIONS.USERS_READ]: { label: "Foydalanuvchilarni ko'rish", group: "users" },
  [PERMISSIONS.ARCHIVE_REASONS_MANAGE]: {
    label: "Arxiv sabablarini boshqarish",
    group: "users",
  },
  [PERMISSIONS.LEADS_READ]: { label: "Lidlarni ko'rish", group: "leads" },
  [PERMISSIONS.LEADS_MANAGE]: { label: "Lidlarni boshqarish", group: "leads" },

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

  [PERMISSIONS.ATTENDANCE_READ]: { label: "Davomatni ko'rish", group: "attendance" },
  [PERMISSIONS.ATTENDANCE_RECORD]: { label: "Davomatni belgilash", group: "attendance" },
  [PERMISSIONS.ATTENDANCE_MANAGE]: { label: "Davomatni boshqarish", group: "attendance" },

  [PERMISSIONS.GRADES_READ]: { label: "Baholarni ko'rish", group: "grades" },
  [PERMISSIONS.GRADES_RECORD]: { label: "Baho qo'yish", group: "grades" },
  [PERMISSIONS.GRADES_MANAGE]: { label: "Baholashni boshqarish", group: "grades" },
  [PERMISSIONS.RATING_READ]: { label: "Reytingni ko'rish", group: "rating" },
  [PERMISSIONS.RATING_MANAGE]: { label: "Reyting sozlamalarini boshqarish", group: "rating" },

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
  [PERMISSIONS.ACTIVITY_LOGS_READ]: {
    label: "Faoliyat loglarini ko'rish",
    group: "audit",
  },

  [PERMISSIONS.FINANCE_READ]: { label: "Moliyani ko'rish", group: "finance" },
  [PERMISSIONS.FINANCE_PAY]: { label: "To'lov qabul qilish", group: "finance" },
  [PERMISSIONS.FINANCE_MANAGE]: { label: "Moliyani boshqarish", group: "finance" },

  [PERMISSIONS.SALARY_READ]: { label: "Maoshlarni ko'rish", group: "finance" },
  [PERMISSIONS.SALARY_PAY]: { label: "Maosh to'lash", group: "finance" },
};
