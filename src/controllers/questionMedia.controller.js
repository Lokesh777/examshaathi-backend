const multer = require("multer");
const questionModel = require("../models/question.model");
const officialPaperCatalogModel = require("../models/officialPaperCatalog.model");
const {
  isImageKitConfigured,
  uploadFromMulterFile,
} = require("../services/imageStorage.service");
const { mapQuestionToPaperData } = require("../services/paperDataFormatter.service");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const uploadQuestionMediaHandler = async (req, res) => {
  try {
    if (!isImageKitConfigured()) {
      return res.status(400).json({ success: false, message: "ImageKit not configured" });
    }
    const { questionId } = req.params;
    const question = await questionModel.findById(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    const url = await uploadFromMulterFile(
      req.file,
      `questions/${questionId}/stem.png`
    );
    question.questionMedia = { type: "image", url, alt: req.body.alt || "" };
    await question.save();

    res.json({ success: true, questionMedia: question.questionMedia });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const uploadOptionMediaHandler = async (req, res) => {
  try {
    if (!isImageKitConfigured()) {
      return res.status(400).json({ success: false, message: "ImageKit not configured" });
    }
    const { questionId } = req.params;
    const letter = (req.body.letter || req.query.letter || "").toUpperCase();
    if (!["A", "B", "C", "D"].includes(letter)) {
      return res.status(400).json({ success: false, message: "letter must be A-D" });
    }

    const question = await questionModel.findById(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    const url = await uploadFromMulterFile(
      req.file,
      `questions/${questionId}/opt-${letter}.png`
    );

    const optionMedia = question.optionMedia || [];
    const idx = optionMedia.findIndex((o) => o.letter === letter);
    const entry = { letter, url, alt: req.body.alt || `Option ${letter}` };
    if (idx >= 0) optionMedia[idx] = entry;
    else optionMedia.push(entry);

    question.optionMedia = optionMedia;
    question.options = ["A", "B", "C", "D"];
    question.answerMode = "letter";
    await question.save();

    res.json({ success: true, optionMedia: question.optionMedia });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const uploadCatalogQuestionMediaHandler = async (req, res) => {
  try {
    if (!isImageKitConfigured()) {
      return res.status(400).json({ success: false, message: "ImageKit not configured" });
    }
    const { catalogId } = req.params;
    const qNo = parseInt(req.body.qNo || req.query.qNo, 10);
    const kind = req.body.kind || "question";
    const letter = (req.body.letter || "").toUpperCase();

    if (!qNo) {
      return res.status(400).json({ success: false, message: "qNo required" });
    }

    const catalog = await officialPaperCatalogModel.findById(catalogId);
    if (!catalog) {
      return res.status(404).json({ success: false, message: "Catalog not found" });
    }

    const url = await uploadFromMulterFile(
      req.file,
      `official-papers/${catalogId}/q${qNo}-${kind}${letter ? `-${letter}` : ""}.png`
    );

    const paperData = catalog.paperData || { questions: [] };
    const questions = paperData.questions || [];
    let q = questions.find((x) => x.qNo === qNo);
    if (!q) {
      q = {
        qNo,
        questionText: `प्रश्न ${qNo}`,
        options: ["A", "B", "C", "D"],
        correctAnswer: "A",
        answerMode: "letter",
      };
      questions.push(q);
    }

    if (kind === "question") {
      q.questionMedia = { type: "image", url, alt: `Question ${qNo}` };
    } else if (kind === "option" && letter) {
      q.optionMedia = q.optionMedia || [];
      const idx = q.optionMedia.findIndex((o) => o.letter === letter);
      const entry = { letter, url, alt: `Option ${letter}` };
      if (idx >= 0) q.optionMedia[idx] = entry;
      else q.optionMedia.push(entry);
      q.options = ["A", "B", "C", "D"];
      q.answerMode = "letter";
    }

    paperData.questions = questions;
    catalog.paperData = paperData;
    catalog.status = "extracted";
    await catalog.save();

    res.json({ success: true, question: mapQuestionToPaperData(q) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  upload,
  uploadQuestionMediaHandler,
  uploadOptionMediaHandler,
  uploadCatalogQuestionMediaHandler,
};
