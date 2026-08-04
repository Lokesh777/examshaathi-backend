const mongoose = require("mongoose");

const officialPaperCatalogSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "exam",
      required: true,
    },
    rsmssbTitle: { type: String, required: true },
    year: { type: Number, required: true },
    setCode: { type: String, default: "" },
    questionDownloadFileId: { type: String, required: true },
    answerKeyDownloadFileId: { type: String, required: true },
    questionPdfUrl: { type: String, required: true },
    answerKeyPdfUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "linked", "downloading", "extracting", "extracted", "published", "failed"],
      default: "pending",
    },
    currentStage: { type: String, default: null },
    stageLogs: [
      {
        stage: String,
        message: String,
        level: { type: String, enum: ["info", "warn", "error"], default: "info" },
        at: { type: Date, default: Date.now },
      },
    ],
    extractionMethod: {
      type: String,
      enum: ["pdf-parse", "openai", "gemini", "ollama", "ocr", "admin-import", null],
      default: null,
    },
    activeProvider: { type: String, default: null },
    activeModel: { type: String, default: null },
    pageProgress: {
      current: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      phase: { type: String, default: null },
      questionsFound: { type: Number, default: 0 },
      updatedAt: { type: Date, default: null },
    },
    providerAttempts: [
      {
        provider: String,
        model: String,
        stage: String,
        success: Boolean,
        error: { type: String, default: null },
        questionCount: { type: Number, default: 0 },
        at: { type: Date, default: Date.now },
      },
    ],
    /** Extracted quiz JSON (paper_data shape) — saved after successful OCR/AI extract */
    paperData: { type: mongoose.Schema.Types.Mixed, default: null },
    stats: {
      extracted: { type: Number, default: 0 },
      matched: { type: Number, default: 0 },
      inserted: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "quiz", default: null },
    errorMessage: { type: String, default: null },
    syncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

officialPaperCatalogSchema.index(
  { examId: 1, questionDownloadFileId: 1 },
  { unique: true }
);

const officialPaperCatalogModel = mongoose.model(
  "officialPaperCatalog",
  officialPaperCatalogSchema
);
module.exports = officialPaperCatalogModel;
