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
    },
  },
  {
    timestamps: true,
  },
);

const examModel = mongoose.model("exam", examSchema);

module.exports = examModel;