const isProd = process.env.NODE_ENV === "production";

/**
 * Refresh-token cookie.
 * Production: SameSite=None + Secure so cross-origin SPAs can receive it.
 * Prefer a same-origin frontend proxy (/api → Render) so the cookie is
 * first-party and not blocked by third-party cookie restrictions.
 * Development: Lax works for localhost (different ports are same-site).
 */
const cookies_options = {
  httpOnly: true,
  path: "/",
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

/** Must mirror set-cookie flags (except maxAge) or clearCookie is a no-op. */
const clear_cookies_options = {
  httpOnly: true,
  path: "/",
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
};

module.exports = { cookies_options, clear_cookies_options };
