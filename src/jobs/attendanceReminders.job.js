import logger from "../config/logger.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { listForGroupOnDate } from "../modules/attendance/services/attendance.service.js";
import { send as sendNotification } from "../modules/notifications/services/notifications.service.js";
import {
  localTodayMidnight,
  localDayOfWeek,
  localTodayKey,
} from "../helpers/attendance.helper.js";
import { ROLES } from "../constants/roles.js";

export const JOB_NAME = "daily.attendance-unmarked";

// Har kuni kechqurun: bugun dars bo'lgan, lekin davomati to'liq belgilanmagan
// guruhlar bo'yicha o'qituvchilarga eslatma va egasiga umumiy hisobot yuboradi.
export default function defineAttendanceReminders(agenda) {
  agenda.define(JOB_NAME, async () => {
    const today = localTodayMidnight();
    const dow = localDayOfWeek();
    const dayKey = localTodayKey();

    const groups = await Group.find({
      isActive: true,
      isDeleted: { $ne: true },
      "schedule.day": dow,
    });

    const perTeacher = new Map(); // teacherId -> [{ name, unmarked, total }]
    const ownerDigest = [];

    for (const g of groups) {
      let data;
      try {
        data = await listForGroupOnDate(g._id, today);
      } catch (err) {
        logger.warn({ err, groupId: g._id }, "Guruh davomati o'qilmadi");
        continue;
      }
      if (!data.isClassDay) continue; // bayram / kurs oralig'idan tashqari
      const total = data.rows.length;
      if (total === 0) continue;
      const unmarked = data.rows.filter((r) => !r.attendance).length;
      if (unmarked === 0) continue;

      ownerDigest.push({ name: g.name, unmarked, total });
      for (const t of g.teachers || []) {
        const k = String(t);
        if (!perTeacher.has(k)) perTeacher.set(k, []);
        perTeacher.get(k).push({ name: g.name, unmarked, total });
      }
    }

    let sent = 0;
    for (const [teacherId, list] of perTeacher) {
      const lines = list.map(
        (x) => `• ${x.name}: ${x.unmarked}/${x.total} belgilanmagan`,
      );
      try {
        await sendNotification(
          {
            title: "Bugungi davomat belgilanmagan",
            body: `Quyidagi guruhlarda bugungi davomat to'liq belgilanmagan:\n${lines.join("\n")}`,
            category: "attendance",
            audience: { type: "auto_system", userIds: [teacherId] },
            isAuto: true,
            dedupeKey: `att-unmarked:${teacherId}:${dayKey}`,
          },
          null,
        );
        sent += 1;
      } catch (err) {
        logger.warn({ err, teacherId }, "O'qituvchi eslatmasi yuborilmadi");
      }
    }

    if (ownerDigest.length > 0) {
      const owners = await User.find(
        { role: ROLES.OWNER, isActive: true, isDeleted: { $ne: true } },
        { _id: 1 },
      );
      if (owners.length) {
        const lines = ownerDigest.map((x) => `• ${x.name}: ${x.unmarked}/${x.total}`);
        try {
          await sendNotification(
            {
              title: "Davomat belgilanmagan guruhlar",
              body: `Bugun ${ownerDigest.length} ta guruhda davomat to'liq belgilanmadi:\n${lines.join("\n")}`,
              category: "attendance",
              audience: { type: "auto_system", userIds: owners.map((o) => o._id) },
              isAuto: true,
              dedupeKey: `att-unmarked-owner:${dayKey}`,
            },
            null,
          );
        } catch (err) {
          logger.warn({ err }, "Egasiga davomat hisoboti yuborilmadi");
        }
      }
    }

    logger.info(
      { scanned: groups.length, flagged: ownerDigest.length, sent },
      "Davomat eslatmalari yuborildi",
    );
  });
}
