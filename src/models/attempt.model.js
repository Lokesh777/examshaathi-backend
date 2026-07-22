const mongoose = require("mongoose");

const attemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "quiz",
      required: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "exam",
      required: true, // denormalized — fast leaderboard queries
    },
    answers: [
      {
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: "question" },
        selectedOption: { type: String, default: null }, // null = unanswered
        isCorrect: { type: Boolean },
      },
    ],
    score: {
      type: Number,
      required: true,
    },
    totalQuestions: {
      type: Number,
      required: true,
    },
    scorePercent: {
      type: Number,
      required: true,
    },
    timeTakenSeconds: {
      type: Number,
    },
  },
  { timestamps: true }
);

const attemptModel = mongoose.model("attempt", attemptSchema);
module.exports = attemptModel;