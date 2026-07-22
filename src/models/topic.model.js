const mongoose = require("mongoose");

const topicSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "exam",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    patternSection: {
      type: String,
      default: null,
    },
    weightage: {
      type: Number,
      default: null,
    },
    weightageConfidence: {
      type: String,
      enum: ["official", "estimated", null],
      default: null,
    },
    weightageSourceLinks: {
      type: [String],
      default: [],
    },
    deprecated: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const topicModel = mongoose.model("topic", topicSchema);
module.exports = topicModel;