const mongoose = require("mongoose");

const userExamStreakSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "exam",
      required: true,
    },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    /** Calendar day in Asia/Kolkata (YYYY-MM-DD) when daily was last completed */
    lastCompletedDate: { type: String, default: null },
    lastDailyQuizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "quiz",
      default: null,
    },
  },
  { timestamps: true }
);

userExamStreakSchema.index({ userId: 1, examId: 1 }, { unique: true });

module.exports = mongoose.model("userExamStreak", userExamStreakSchema);
