const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
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
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      default: undefined,
      // only assistant messages (the answer) get an embedding —
      // that's what we search against for cache-hits
    },
    linkedQuizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "quiz",
      default: null,
    },
  },
  { timestamps: true }
);

const chatMessageModel = mongoose.model("chatmessage", chatMessageSchema);
module.exports = chatMessageModel;