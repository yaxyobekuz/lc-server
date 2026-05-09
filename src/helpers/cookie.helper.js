import env, { isProd } from "../config/env.js";

const REFRESH_COOKIE = "refreshToken";
// 7 kun (millisekundda)
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    domain: env.COOKIE_DOMAIN,
    path: "/api/auth",
    maxAge: REFRESH_MAX_AGE,
    signed: true,
  });
};

export const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    domain: env.COOKIE_DOMAIN,
    path: "/api/auth",
    signed: true,
  });
};

export const getRefreshFromCookies = (req) =>
  req.signedCookies?.[REFRESH_COOKIE] || null;
