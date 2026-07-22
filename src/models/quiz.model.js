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