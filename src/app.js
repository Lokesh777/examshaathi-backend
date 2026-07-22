const express = require("express");

const cors = require("cors");
const userRouter = require("./routes/user.route")
const quizRouter = require("./routes/quiz.routes")
const chatRouter = require("./routes/chat.routes")
const examRouter = require("./routes/exam.routes")
const cookieParser = require("cookie-parser")

const app = express();

app.use(express.json())
app.use(cookieParser());
app.use(
  cors({
    origin(origin, callback) {

      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://examshaathi-backend.onrender.com",
      ];

      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".lovable.app")
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


module.exports = app