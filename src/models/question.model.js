const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "exam",
      required: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "topic",
      required: true,
    },
    questionText: {
      type: String,
      required: true,
    },
    options: {
      type: [String],
      required: true,
    },
    correctAnswer: {
      type: String,
      required: true,
    },
    explanation: {
      type: String,
      required: true,
    },
    referenceLinks: {
      type: [String],
      default: [],
      // Real URLs from Tavily search used to generate this question batch.
      // NOT AI-invented — kept optional (not required) because a link
      // genuinely may not exist for every topic; better to show none
      // than a fake one.
    },
    difficulty: {
      type: String,
      enum: ["easy", "moderate", "hard"],
      default: "moderate",
    },
    pattern: {
      type: String,
      enum: ["old", "new"],
      default: "new",
    },
    source: {
      type: String,
      enum: ["ai", "admin", "previous-paper"],
      default: "ai",
    },
    year: {
      type: Number,
      required: function () {
        return this.source === "previous-paper";
        // AI-generated questions don't have a "year" — only real papers do
      },
    },
  },
  { timestamps: true }
);

const questionModel = mongoose.model("question", questionSchema);

module.exports = questionModel;