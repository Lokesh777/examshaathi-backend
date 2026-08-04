const multer = require("multer");
const mongoose = require("mongoose");
const contactSubmissionModel = require("../models/contactSubmission.model");
const { CATEGORIES } = require("../models/contactSubmission.model");
const { appendContactRow } = require("../services/googleSheets.service");
const {
  isImageKitConfigured,
  uploadFromMulterFile,
} = require("../services/imageStorage.service");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith("image/")) {
      return cb(new Error("Screenshot must be an image (PNG, JPG, WebP)."));
    }
    cb(null, true);
  },
});

const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

const submitContact = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const category = String(req.body.category || "general").trim();
    const subject = String(req.body.subject || "").trim();
    const message = String(req.body.message || "").trim();
    const source =
      req.body.source === "feedback" ? "feedback" : "contact";

    if (!name || name.length < 2) {
      return res.status(400).json({ success: false, message: "Name is required." });
    }
    if (!emailOk(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required." });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Use: ${CATEGORIES.join(", ")}`,
      });
    }
    if (!subject || subject.length < 3) {
      return res.status(400).json({ success: false, message: "Subject is required." });
    }
    if (!message || message.length < 10) {
      return res
        .status(400)
        .json({ success: false, message: "Message must be at least 10 characters." });
    }

    let screenshotUrl = null;
    if (req.file) {
      if (!isImageKitConfigured()) {
        return res.status(503).json({
          success: false,
          message:
            "Screenshot upload is temporarily unavailable (ImageKit not configured). Send without an image, or try again later.",
        });
      }
      try {
        const safeName = `contact-${Date.now()}-${(req.file.originalname || "shot")
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .slice(0, 60)}`;
        screenshotUrl = await uploadFromMulterFile(req.file, safeName);
      } catch (uploadErr) {
        console.error("[contact] ImageKit upload failed:", uploadErr.message);
        return res.status(502).json({
          success: false,
          message: `Could not upload screenshot: ${uploadErr.message}`,
        });
      }
    }

    const doc = await contactSubmissionModel.create({
      name,
      email,
      category,
      subject,
      message,
      screenshotUrl,
      source,
      sheetSynced: false,
      userAgent: req.get("user-agent") || null,
    });

    let sheetSynced = false;
    let sheetError = null;
    try {
      await appendContactRow(doc.toObject());
      sheetSynced = true;
      await contactSubmissionModel.updateOne(
        { _id: doc._id },
        { $set: { sheetSynced: true, sheetError: null } }
      );
    } catch (err) {
      sheetError = err.message || "Sheet sync failed";
      console.error("[contact] Google Sheets append failed:", sheetError);
      await contactSubmissionModel.updateOne(
        { _id: doc._id },
        { $set: { sheetSynced: false, sheetError } }
      );
    }

    return res.status(201).json({
      success: true,
      data: {
        id: doc._id,
        sheetSynced,
        screenshotUrl,
        message: sheetSynced
          ? "Thanks — we received your message."
          : "Thanks — we received your message (saved; sheet sync pending).",
      },
    });
  } catch (err) {
    console.error("[contact] submit failed:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to submit",
    });
  }
};

const listFeedback = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const category = req.query.category;
    const filter = {};
    if (category && CATEGORIES.includes(category)) filter.category = category;

    const [items, total] = await Promise.all([
      contactSubmissionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      contactSubmissionModel.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        imageKitReady: isImageKitConfigured(),
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${
          process.env.GOOGLE_SHEETS_CONTACT_ID?.trim() ||
          "1UnbN4jcPNKXlnnaYZmXpTyv1jDsv3-csUSrrLSd4-dM"
        }/edit`,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const deleteFeedback = async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.ids)
      ? req.body.ids
      : req.params.id
        ? [req.params.id]
        : [];

    const ids = [...new Set(rawIds.map(String).filter(Boolean))].filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );

    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one valid submission id.",
      });
    }

    const result = await contactSubmissionModel.deleteMany({ _id: { $in: ids } });

    return res.json({
      success: true,
      data: { deleted: result.deletedCount, ids },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  upload,
  submitContact,
  listFeedback,
  deleteFeedback,
};
