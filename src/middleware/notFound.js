import ApiError from "../utils/ApiError.js";

const notFound = (req, _res, next) => {
  next(new ApiError(404, `Yo'nalish topilmadi: ${req.method} ${req.originalUrl}`));
};

export default notFound;
