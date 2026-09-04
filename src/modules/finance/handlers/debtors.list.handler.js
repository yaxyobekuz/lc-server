import asyncHandler from "../../../middleware/asyncHandler.js";
import { buildMeta } from "../../../utils/pagination.js";
import * as debtService from "../services/debt.service.js";

const debtorsList = asyncHandler(async (req, res) => {
  const { items, total, page, limit, summary } = await debtService.listDebtors(
    req.query,
  );
  res.json({
    success: true,
    data: items,
    summary,
    meta: buildMeta({ page, limit, total }),
  });
});

export default debtorsList;
