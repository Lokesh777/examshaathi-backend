const express = require("express");
const { verifyUser } = require("../middleware/user.middleware");
const { verifyAdmin } = require("../middleware/admin.middleware");
const officialPaperController = require("../controllers/officialPaper.controller");
const {
  upload,
  uploadQuestionMediaHandler,
  uploadOptionMediaHandler,
  uploadCatalogQuestionMediaHandler,
} = require("../controllers/questionMedia.controller");

const router = express.Router();

router.get(
  "/exams/:examId",
  verifyUser,
  officialPaperController.listOfficialPapersHandler
);

router.post(
  "/admin/exams/:examId/sync",
  verifyUser,
  verifyAdmin,
  officialPaperController.startSyncHandler
);

router.post(
  "/admin/exams/:examId/sync/links",
  verifyUser,
  verifyAdmin,
  officialPaperController.startLinkSyncHandler
);

router.post(
  "/admin/exams/:examId/sync/extract",
  verifyUser,
  verifyAdmin,
  officialPaperController.startExtractSyncHandler
);

router.get(
  "/admin/exams/:examId/sync/capabilities",
  verifyUser,
  verifyAdmin,
  officialPaperController.getAiCapabilitiesHandler
);

router.get(
  "/admin/sync/:jobId",
  verifyUser,
  verifyAdmin,
  officialPaperController.getSyncStatusHandler
);

router.post(
  "/admin/catalog/:catalogId/extract-image-questions",
  verifyUser,
  verifyAdmin,
  officialPaperController.extractImageQuestionsHandler
);

router.post(
  "/admin/catalog/:catalogId/question-media",
  verifyUser,
  verifyAdmin,
  upload.single("file"),
  uploadCatalogQuestionMediaHandler
);

router.post(
  "/admin/questions/:questionId/media",
  verifyUser,
  verifyAdmin,
  upload.single("file"),
  uploadQuestionMediaHandler
);

router.post(
  "/admin/questions/:questionId/option-media",
  verifyUser,
  verifyAdmin,
  upload.single("file"),
  uploadOptionMediaHandler
);

module.exports = router;
