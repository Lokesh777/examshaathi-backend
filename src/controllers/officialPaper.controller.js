const { listPapersForExam } = require("../services/officialPaper.service");
const {
  startSync,
  startLinkSync,
  startExtractSync,
  getSyncJobStatus,
  getAiProviderCapabilities,
} = require("../services/officialPaperIngestion.service");
const { extractImageQuestionsForCatalog } = require("../services/imageQuestionExtraction.service");

const listOfficialPapersHandler = async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user._id || req.user.id;
    const isAdmin = req.user.role === "admin";
    const data = await listPapersForExam(examId, userId, { isAdmin });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const startSyncHandler = async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user._id || req.user.id;
    const result = await startSync(examId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const startLinkSyncHandler = async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user._id || req.user.id;
    const result = await startLinkSync(examId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const startExtractSyncHandler = async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user._id || req.user.id;
    const catalogId = req.body?.catalogId || null;
    const extractAll = Boolean(req.body?.extractAll);
    const provider = req.body?.provider || null;
    const publishOnly = Boolean(req.body?.publishOnly);
    const fillMissing = Boolean(req.body?.fillMissing);
    const forceReExtract = fillMissing ? true : req.body?.forceReExtract !== false;
    const publishQuiz = publishOnly ? true : req.body?.publishQuiz !== false;
    const result = await startExtractSync(examId, userId, {
      catalogId,
      extractAll,
      provider,
      publishOnly,
      publishQuiz,
      forceReExtract,
      fillMissing,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getSyncStatusHandler = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await getSyncJobStatus(jobId);
    res.json({ success: true, job });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
};

const getAiCapabilitiesHandler = async (req, res) => {
  try {
    const capabilities = await getAiProviderCapabilities();
    res.json({ success: true, capabilities });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const extractImageQuestionsHandler = async (req, res) => {
  try {
    const { catalogId } = req.params;
    const qNos = Array.isArray(req.body?.qNos)
      ? req.body.qNos.map((n) => parseInt(n, 10)).filter(Boolean)
      : null;
    const result = await extractImageQuestionsForCatalog(catalogId, qNos);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  listOfficialPapersHandler,
  startSyncHandler,
  startLinkSyncHandler,
  startExtractSyncHandler,
  getSyncStatusHandler,
  getAiCapabilitiesHandler,
  extractImageQuestionsHandler,
};
