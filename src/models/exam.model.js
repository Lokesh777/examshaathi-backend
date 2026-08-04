const mongoose = require("mongoose");

const examSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
    },
    syllabusStatus: {
      type: String,
      enum: ["pending", "fetching", "ready"],
      default: "pending",
    },
    pattern: {
      totalQuestions: {
        type: Number,
        default: 0,
      },
      totalMarks: {
        type: Number,
        default: null,
      },
      marksPerQuestion: {
        type: Number,
        default: null,
      },
      durationMinutes: {
        type: Number,
        default: null,
      },
      passingMarksPercent: {
        type: Number,
        default: null,
      },
      examMode: {
        type: String,
        default: null,
      },
      negativeMarkingFraction: {
        type: Number,
        default: null,
      },
      sections: [
        {
          topicName: { type: String },
          questionCount: { type: Number },
          marks: { type: Number },
        },
      ],
      lastRefreshedAt: {
        type: Date,
        default: null,
      },
      sourceLinks: {
        type: [String],
        default: [],
      },
      officialSyllabusUrl: {
        type: String,
        default: null,
      },
    },
    questionProfile: {
      optionCount: { type: Number, default: null },
      fifthOptionText: { type: String, default: null },
      defaultPattern: { type: String, enum: ["old", "new"], default: null },
      language: { type: String, default: null },
      enabledQuestionTypes: [{ type: String }],
      typeMix: { type: mongoose.Schema.Types.Mixed, default: null },
      markingScheme: {
        correct: { type: Number, default: null },
        incorrect: { type: Number, default: null },
        unanswered: { type: Number, default: null },
        disqualifyBlankPercent: { type: Number, default: null },
      },
    },
  },
  {
    timestamps: true,
  },
);

const examModel = mongoose.model("exam", examSchema);

module.exports = examModel;