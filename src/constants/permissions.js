// Permission kalitlari (DB seedda ham shu kalitlar yoziladi)
export const PERMISSIONS = Object.freeze({
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
});

// Human-readable labels (used by the seed)
export const PERMISSION_LABELS = {
  [PERMISSIONS.STUDENTS_READ]: { label: "Talabalarni ko'rish", group: "students" },
  [PERMISSIONS.STUDENTS_CREATE]: { label: "Talabalarni yaratish", group: "students" },
  [PERMISSIONS.STUDENTS_UPDATE]: { label: "Talabalarni tahrirlash", group: "students" },
  [PERMISSIONS.STUDENTS_DELETE]: { label: "Talabalarni o'chirish", group: "students" },

  [PERMISSIONS.TEACHERS_READ]: { label: "O'qituvchilarni ko'rish", group: "teachers" },
  [PERMISSIONS.TEACHERS_CREATE]: { label: "O'qituvchilarni yaratish", group: "teachers" },
  [PERMISSIONS.TEACHERS_UPDATE]: { label: "O'qituvchilarni tahrirlash", group: "teachers" },
  [PERMISSIONS.TEACHERS_DELETE]: { label: "O'qituvchilarni o'chirish", group: "teachers" },

  [PERMISSIONS.CLASSES_READ]: { label: "Sinflarni ko'rish", group: "classes" },
  [PERMISSIONS.CLASSES_CREATE]: { label: "Sinflarni yaratish", group: "classes" },
  [PERMISSIONS.CLASSES_UPDATE]: { label: "Sinflarni tahrirlash", group: "classes" },
  [PERMISSIONS.CLASSES_DELETE]: { label: "Sinflarni o'chirish", group: "classes" },
};
