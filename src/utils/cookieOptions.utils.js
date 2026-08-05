const isProd = process.env.NODE_ENV === "production";

const cookies_options = {
  httpOnly: true,
  secure: isProd,
  // Cross-site SPA (Vercel) → API (Render) needs SameSite=None + Secure in production
  sameSite: "none",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

module.exports = { cookies_options };
