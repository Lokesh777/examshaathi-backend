const mongoose = require("mongoose");

const quizSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "exam",
      required: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "topic",
      default: null, // null = full real-paper mock
    },
    type: {
      type: String,
      enum: ["topic-wise", "real-paper"],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    // models/quiz.model.js — add these two fields
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: "question" }],
    // frozen snapshot for real-paper type at creation time — this is what was missing.
    // topic-wise quizzes can leave this empty and keep using pullRule/bank-sampling as-is.

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
  // who generated this paper — needed so we can show "your papers" if you ever scope it per-user
    pullRule: {
      topicId: { type: mongoose.Schema.Types.ObjectId, ref: "topic" },
      count: { type: Number },
      difficultyMix: { type: Object }, // optional, Phase 1: keep simple/unused
      sections: [
        {
          topicId: { type: mongoose.Schema.Types.ObjectId, ref: "topic" },
          count: { type: Number },
        },
      ], // used only for real-paper type
    },
  },
  { timestamps: true }
);

const quizModel = mongoose.model("quiz", quizSchema);
module.exports = quizModel;