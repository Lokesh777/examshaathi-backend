const express = require("express");

const cors = require("cors");
const userRouter = require("./routes/user.route")
const quizRouter = require("./routes/quiz.routes")
const chatRouter = require("./routes/chat.routes")
const examRouter = require("./routes/exam.routes")
const attemptRouter = require("./routes/attempt.routes")
const officialPaperRouter = require("./routes/officialPaper.routes")
const adminImportRouter = require("./routes/adminImport.routes")
const contactRouter = require("./routes/contact.routes")
const cookieParser = require("cookie-parser")

const app = express();

const isLocalhostOrigin = (origin) => {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const BODY_LIMIT = process.env.JSON_BODY_LIMIT || "15mb";

app.use(express.json({ limit: BODY_LIMIT }))
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }))
app.use(cookieParser());
app.use(
  cors({
    origin(origin, callback) {
      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://examshaathicom.vercel.app",
        "http://localhost:8080",
        "http://localhost:5173",
        "https://examshaathi-backend.onrender.com",
        "https://preview--crack-it-buddy.lovable.app/",
      ];

      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".lovable.app") ||
        isLocalhostOrigin(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use("/api/user", userRouter)
app.use("/api/quiz", quizRouter)
app.use("/api/chat", chatRouter)
app.use("/api/exam", examRouter)
app.use("/api/paper", attemptRouter)
app.use("/api/official-papers", officialPaperRouter)
app.use("/api/admin", adminImportRouter)
app.use("/api/contact", contactRouter)

// body-parser "entity too large" → clear JSON response
app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: `Request body too large. Limit is ${BODY_LIMIT}. Split import into smaller batches or upload a .json file.`,
    });
  }
  next(err);
});


module.exports = app