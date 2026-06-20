import logger from "../config/logger.js";
import * as groupsService from "../modules/groups/services/groups.service.js";

export const JOB_NAME = "daily.auto-end-groups";

// Har kuni: tugash sanasi (endDate) yetib kelgan guruhlarni avtomatik arxivlaydi
// (o'qituvchi davrlari + o'quvchi a'zoliklari o'sha kunda yopiladi). Idempotent.
export default function defineAutoEndGroups(agenda) {
  agenda.define(JOB_NAME, async () => {
    const result = await groupsService.processDueGroupEnds();
    if (result.archived) logger.info(result, "Tugagan kurslar avto-arxivlandi");
  });
}
