import User from "../../../models/user.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";

// O'quv markazi nomi (brend). Hozircha statik - kelajakda config'dan olinishi mumkin.
const CENTER_NAME = "Bayyina";

// Xabar matnidagi o'zgaruvchilar (placeholder). Frontend MESSAGE_VARIABLES bilan mos.
// Eslatma: {qarz} uchun real to'lov ma'lumoti tizimda yo'q - bo'sh qoldiriladi.
const TOKENS = ["{ism}", "{familiya}", "{guruh}", "{qarz}", "{markaz}"];

// Matnda almashtirish kerak bo'lgan token bormi? (bo'lmasa - keraksiz DB so'rovini o'tkazib yuboramiz)
export const hasTokens = (text = "") => {
  const s = String(text || "");
  return TOKENS.some((t) => s.includes(t));
};

const replaceAll = (text, token, value) => text.split(token).join(value ?? "");

// Berilgan qiymatlar bilan matndagi {token}larni almashtiradi.
const applyValues = (text, { firstName, lastName, groupName }) => {
  let out = String(text || "");
  out = replaceAll(out, "{ism}", firstName);
  out = replaceAll(out, "{familiya}", lastName);
  out = replaceAll(out, "{guruh}", groupName);
  out = replaceAll(out, "{qarz}", ""); // to'lov tizimi yo'q
  out = replaceAll(out, "{markaz}", CENTER_NAME);
  return out;
};

// Bitta foydalanuvchining active guruh nomini qaytaradi (yo'q bo'lsa "").
const resolveGroupName = async (userId) => {
  const membership = await GroupMembership.findOne({
    student: userId,
    leftAt: null,
    isDeleted: { $ne: true },
  })
    .sort({ joinedAt: -1 })
    .populate({ path: "group", select: "name" })
    .lean();
  return membership?.group?.name || "";
};

// Bitta foydalanuvchi uchun bir nechta matnni shaxsiylashtiradi (in-app inbox).
// Foydalanuvchi ism/familiya va guruh nomi BIR MARTA yechiladi, so'ng har bir
// matnga qo'llaniladi. texts - string[], qaytadi - personalized string[].
export const personalizeManyForUser = async (texts, userId, recipientUser = null) => {
  const anyToken = texts.some((t) => hasTokens(t));
  if (!anyToken) return texts;

  let user = recipientUser;
  if (!user || user.firstName === undefined) {
    user = await User.findById(userId, { firstName: 1, lastName: 1 }).lean();
  }

  const needsGroup = texts.some((t) => String(t).includes("{guruh}"));
  const groupName = needsGroup ? await resolveGroupName(userId) : "";

  const values = {
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    groupName,
  };
  return texts.map((t) => (hasTokens(t) ? applyValues(t, values) : t));
};

// Bitta foydalanuvchi, bitta matn uchun qulaylik wrapper.
export const personalizeForUser = async (text, userId, recipientUser = null) => {
  const [out] = await personalizeManyForUser([text], userId, recipientUser);
  return out;
};

// Ko'p foydalanuvchi uchun matnni partiyalab shaxsiylashtiradi (bot yetkazish).
// userIds - ObjectId[] | string[]. Qaytadi: Map<userIdString, personalizedText>.
// N+1 yo'q: user va guruh nomlari bitta-bittadan so'rovda olinadi.
export const personalizeBulk = async (text, userIds) => {
  const ids = userIds.map(String);
  if (!hasTokens(text)) {
    return new Map(ids.map((id) => [id, text]));
  }

  const users = await User.find(
    { _id: { $in: ids } },
    { firstName: 1, lastName: 1 },
  ).lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  let groupByUser = new Map();
  if (String(text).includes("{guruh}")) {
    // Har bir o'quvchining eng so'nggi active guruh nomi.
    const memberships = await GroupMembership.find(
      { student: { $in: ids }, leftAt: null, isDeleted: { $ne: true } },
      { student: 1, group: 1, joinedAt: 1 },
    )
      .sort({ joinedAt: -1 })
      .populate({ path: "group", select: "name" })
      .lean();
    for (const m of memberships) {
      const key = String(m.student);
      // sort joinedAt:-1 -> birinchi uchragan = eng so'nggi
      if (!groupByUser.has(key)) groupByUser.set(key, m.group?.name || "");
    }
  }

  const result = new Map();
  for (const id of ids) {
    const u = userById.get(id);
    result.set(
      id,
      applyValues(text, {
        firstName: u?.firstName || "",
        lastName: u?.lastName || "",
        groupName: groupByUser.get(id) || "",
      }),
    );
  }
  return result;
};
