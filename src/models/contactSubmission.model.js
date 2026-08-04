const mongoose = require("mongoose");

const CATEGORIES = [
  "feedback",
  "bug",
  "feature_request",
  "career",
  "investor",
  "partnership",
  "general",
];

const contactSubmissionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    category: {
      type: String,
      enum: CATEGORIES,
      required: true,
      default: "general",
    },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    screenshotUrl: { type: String, default: null },
    source: {
      type: String,
      enum: ["contact", "feedback"],
      default: "contact",
    },
    sheetSynced: { type: Boolean, default: false },
    sheetError: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

contactSubmissionSchema.index({ createdAt: -1 });
contactSubmissionSchema.index({ category: 1, createdAt: -1 });

const contactSubmissionModel = mongoose.model(
  "contactSubmission",
  contactSubmissionSchema
);

module.exports = contactSubmissionModel;
module.exports.CATEGORIES = CATEGORIES;
