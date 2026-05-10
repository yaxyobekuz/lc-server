import logger from "../config/logger.js";
import * as salariesService from "../modules/salaries/services/salaries.service.js";
import { previousMonthOf } from "../helpers/salary.helper.js";

export const JOB_NAME = "monthly.salary-auto-calculate";

export default function defineSalaryAutoCalculate(agenda) {
  agenda.define(JOB_NAME, async () => {
    const period = previousMonthOf(new Date());
    const result = await salariesService.calculateForAll(period, null);
    logger.info({ ...period, ...result }, "Oyliklar avtomatik hisoblandi");
  });
}
