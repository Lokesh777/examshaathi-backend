const express = require("express");
const { verifyUser } = require("../middleware/user.middleware");
const { verifyAdmin } = require("../middleware/admin.middleware");
const {
  getProfile,
  validateImportHandler,
  importHandler,
  generateHandler,
  listCatalogHandler,
} = require("../controllers/adminImport.controller");

const router = express.Router();

router.get(
  "/exams/:examId/profile",
  verifyUser,
  verifyAdmin,
  getProfile
);

router.get(
  "/exams/:examId/catalog",
  verifyUser,
  verifyAdmin,
  listCatalogHandler
);

router.post(
  "/exams/:examId/import/validate",
  verifyUser,
  verifyAdmin,
  validateImportHandler
);

router.post(
  "/exams/:examId/import",
  verifyUser,
  verifyAdmin,
  importHandler
);

router.post(
  "/exams/:examId/generate",
  verifyUser,
  verifyAdmin,
  generateHandler
);

module.exports = router;
