const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const userRouter = require("./routes/user.route");
const quizRouter = require("./routes/quiz.routes");
const chatRouter = require("./routes/chat.routes");
const examRouter = require("./routes/exam.routes");
const attemptRouter = require("./routes/attempt.routes");
const officialPaperRouter = require("./routes/officialPaper.routes");
const adminImportRouter = require("./routes/adminImport.routes");
const contactRouter = require("./routes/contact.routes");

const app = express();
const isProd = process.env.NODE_ENV === "production";

/** Render / Vercel / reverse proxies — needed for secure cookies + correct client IP */
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

const isLocalhostOrigin = (origin) => {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const parseOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const allowedOrigins = new Set([
  ...parseOrigins(process.env.CLIENT_URL),
  ...parseOrigins(process.env.CLIENT_URLS),
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://localhost:8080",
  "http://localhost:5173",
  "https://examshaathicom.vercel.app",
  "https://examshaathi-frontend-web.vercel.app",
  "https://www.examshaathi.com",
  "https://examshaathi.com",
]);

const isVercelPreviewOrigin = (origin) => {
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  if (!isProd && isLocalhostOrigin(origin)) return true;
  if (isVercelPreviewOrigin(origin)) return true;
  return false;
};

const BODY_LIMIT = process.env.JSON_BODY_LIMIT || "15mb";

app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));
app.use(cookieParser());

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      if (!isProd) {
        console.warn("[CORS] blocked origin:", origin);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "examsaathi-api",
    env: process.env.NODE_ENV || "development",
    time: new Date().toISOString(),
  });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 40 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many auth attempts. Try again later." },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 12 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many contact submissions. Try again later." },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 20 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many AI requests. Slow down a moment." },
});

app.use("/api/user/login", authLimiter);
app.use("/api/user/register", authLimiter);
app.use("/api/user/forgot-password", authLimiter);
app.use("/api/user/resend-otp", authLimiter);
app.use("/api/user/verify-email", authLimiter);
app.use("/api/user/reset-password", authLimiter);
app.use("/api/contact", contactLimiter);
app.use("/api/chat", aiLimiter);

app.use("/api/user", userRouter);
app.use("/api/quiz", quizRouter);
app.use("/api/chat", chatRouter);
app.use("/api/exam", examRouter);
app.use("/api/paper", attemptRouter);
app.use("/api/official-papers", officialPaperRouter);
app.use("/api/admin", adminImportRouter);
app.use("/api/contact", contactRouter);

app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: `Request body too large. Limit is ${BODY_LIMIT}. Split import into smaller batches or upload a .json file.`,
    });
  }

  if (err?.message === "Not allowed by CORS") {
    return res.status(403).json({ success: false, message: "Origin not allowed." });
  }

  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;
  if (!isProd) {
    console.error("[API error]", err);
  } else if (status >= 500) {
    console.error("[API error]", err.message || err);
  }

  res.status(status).json({
    success: false,
    message:
      status >= 500 && isProd
        ? "Something went wrong. Please try again."
        : err.message || "Request failed",
  });
});

module.exports = app;
