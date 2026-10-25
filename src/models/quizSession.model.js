const mongoose = require("mongoose");

// Server-side start time for an in-progress quiz, so the leaderboard's
// time tie-break doesn't depend on what the client reports.
const quizSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: "quiz", required: true },
  // TTL: abandoned sessions disappear after a day
  startedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

quizSessionSchema.index({ userId: 1, quizId: 1 }, { unique: true });

const quizSessionModel = mongoose.model("quizsession", quizSessionSchema);
module.exports = quizSessionModel;
