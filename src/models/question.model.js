const mongoose = require("mongoose");

const mediaImageSchema = {
  type: { type: String, enum: ["image"], default: "image" },
  url: { type: String, required: true },
  alt: { type: String, default: "" },
};

const optionMediaSchema = {
  letter: { type: String, enum: ["A", "B", "C", "D"], required: true },
  url: { type: String, required: true },
  alt: { type: String, default: "" },
};

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
    questionMedia: {
      type: { type: String, enum: ["image"] },
      url: String,
      alt: String,
    },
    optionMedia: [optionMediaSchema],
    answerMode: {
      type: String,
      enum: ["text", "letter"],
      default: "text",
    },
    referenceLinks: {
      type: [String],
      default: [],
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
      },
    },
  },
  { timestamps: true }
);

const questionModel = mongoose.model("question", questionSchema);

module.exports = questionModel;
