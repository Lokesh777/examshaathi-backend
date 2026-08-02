const mongoose = require("mongoose");

const syncJobSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "exam",
      required: true,
    },
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
    },
    phase: {
      type: String,
      enum: ["fetch_links", "extract", "full"],
      default: "full",
    },
    currentStage: { type: String, default: null },
    stageLogs: [
      {
        stage: String,
        message: String,
        level: { type: String, enum: ["info", "warn", "error"], default: "info" },
        provider: { type: String, default: null },
        at: { type: Date, default: Date.now },
      },
    ],
    progress: {
      total: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      published: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    currentPaper: { type: String, default: null },
    currentCatalogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "officialPaperCatalog",
      default: null,
    },
    pageProgress: {
      current: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      phase: { type: String, default: null },
      questionsFound: { type: Number, default: 0 },
      updatedAt: { type: Date, default: null },
    },
    activeProvider: { type: String, default: null },
    activeModel: { type: String, default: null },
    preferredProvider: { type: String, default: null },
    errorLog: [{ type: String }],
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const syncJobModel = mongoose.model("syncJob", syncJobSchema);
module.exports = syncJobModel;
