import ApiError from "../utils/ApiError.js";
import { ROLES } from "../constants/roles.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";

// Guruhga kirish: owner - barchasi; teacher - faqat o'ziga biriktirilgan guruh;
// student - taqiqlangan. (requirePermission dan KEYIN qo'yiladi.)
export const requireGroupAccess =
  (extractGroupId = (req) => req.params.groupId) =>
  async (req, _res, next) => {
    try {
      if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));
      if (req.user.role === ROLES.OWNER) return next();
      if (req.user.role === ROLES.TEACHER) {
        const groupId = extractGroupId(req);
        const g = await Group.findById(groupId).select("teachers").lean();
        const isOwn =
          g && (g.teachers || []).some((t) => String(t) === String(req.user._id));
        if (isOwn) return next();
        return next(new ApiError(403, "Bu guruh sizga biriktirilmagan"));
      }
      return next(new ApiError(403, "Ruxsat etilmagan"));
    } catch (err) {
      next(err);
    }
  };

// O'quvchiga kirish: owner - barchasi; student - faqat o'zi; teacher - faqat
// o'z guruhlaridagi o'quvchi.
export const requireStudentAccess =
  (extractStudentId = (req) => req.params.id) =>
  async (req, _res, next) => {
    try {
      if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));
      const sid = String(extractStudentId(req) || "");
      // scopeGroupIds: handler ma'lumotni qaysi guruhlar bilan cheklashini
      // belgilaydi. Owner/student uchun null (barcha guruhlar ko'rinadi -
      // student baribir faqat o'zini so'raydi). Teacher uchun esa faqat o'zi
      // o'qitadigan guruhlar (A-1 cross-group disclosure fix).
      req.scopeGroupIds = null;
      if (req.user.role === ROLES.OWNER) return next();
      if (req.user.role === ROLES.STUDENT) {
        if (sid && sid === String(req.user._id)) return next();
        return next(new ApiError(403, "Ruxsat etilmagan"));
      }
      if (req.user.role === ROLES.TEACHER) {
        const groups = await Group.find({ teachers: req.user._id })
          .select("_id")
          .lean();
        const groupIds = groups.map((g) => g._id);
        if (groupIds.length === 0) {
          return next(new ApiError(403, "Bu o'quvchi sizning guruhlaringizda emas"));
        }
        const membership = await GroupMembership.findOne({
          student: sid,
          group: { $in: groupIds },
          isDeleted: { $ne: true },
        }).lean();
        if (membership) {
          req.scopeGroupIds = groupIds;
          return next();
        }
        return next(new ApiError(403, "Bu o'quvchi sizning guruhlaringizda emas"));
      }
      return next(new ApiError(403, "Ruxsat etilmagan"));
    } catch (err) {
      next(err);
    }
  };
