const officialPaperCatalogModel = require("../models/officialPaperCatalog.model");
const quizModel = require("../models/quiz.model");

const DOWNLOAD_BASE = "https://rsmssb.rajasthan.gov.in/download_file?downloadFileId=";

const normalizeSetCode = (code) =>
  String(code || "")
    .trim()
    .toUpperCase()
    .replace(/^SET\s*/i, "");

const parseDownloadFileId = (url) => {
  if (!url) return null;
  const m = String(url).match(/downloadFileId[=:'"]*(\d+)/i);
  return m ? m[1] : null;
};

const listCatalogForAdmin = async (examId) => {
  const rows = await officialPaperCatalogModel
    .find({ examId })
    .sort({ year: -1, setCode: 1, createdAt: -1 })
    .select(
      "rsmssbTitle year setCode status quizId questionPdfUrl answerKeyPdfUrl syncedAt"
    )
    .lean();

  return rows.map((c) => ({
    catalogId: String(c._id),
    title: c.rsmssbTitle,
    year: c.year,
    setCode: c.setCode,
    status: c.status,
    quizId: c.quizId ? String(c.quizId) : null,
    questionPdfUrl: c.questionPdfUrl,
    answerKeyPdfUrl: c.answerKeyPdfUrl,
    publishedAt: c.syncedAt,
  }));
};

const findCatalogForImport = async (examId, { catalogId, year, setCode } = {}) => {
  if (catalogId) {
    return officialPaperCatalogModel.findOne({ _id: catalogId, examId });
  }

  const code = normalizeSetCode(setCode);
  if (!code) return null;

  const yearNum = year != null && year !== "" ? Number(year) : null;
  const query = { examId, setCode: { $regex: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } };
  if (yearNum && !Number.isNaN(yearNum)) query.year = yearNum;

  return officialPaperCatalogModel.findOne(query).sort({ createdAt: -1 });
};

const resolveCatalogTarget = async (examId, metadata, payload) => {
  const linkMode = metadata.catalogLinkMode || "auto";
  const year = metadata.year ?? payload.year ?? null;
  const setCode = metadata.setCode ?? payload.setCode ?? null;

  if (linkMode === "new") return null;

  if (linkMode === "existing") {
    if (!metadata.catalogId) {
      throw new Error("Select a catalogue entry to link this import");
    }
    const catalog = await findCatalogForImport(examId, { catalogId: metadata.catalogId });
    if (!catalog) throw new Error("Selected catalogue entry not found");
    return catalog;
  }

  // auto — match by set code (+ year when available)
  return findCatalogForImport(examId, { year, setCode });
};

const linkImportToCatalog = async ({
  examId,
  exam,
  metadata,
  payload,
  quizId,
  questionIds,
  insertedCount,
  totalValid,
  skippedCount,
}) => {
  const linkMode = metadata.catalogLinkMode || "auto";
  const year = metadata.year ?? payload.year ?? new Date().getFullYear();
  const setCode = metadata.setCode ?? payload.setCode ?? "";
  const title =
    metadata.title ||
    payload.title ||
    `${exam.name} ${year || ""}`.trim();

  const questionPdfUrl =
    metadata.questionPdfUrl ||
    metadata.sourceUrls?.questionPdf ||
    payload.questionPdfUrl ||
    null;
  const answerKeyPdfUrl =
    metadata.answerKeyPdfUrl ||
    metadata.sourceUrls?.answerKeyPdf ||
    payload.answerKeyPdfUrl ||
    null;

  let catalog = await resolveCatalogTarget(examId, metadata, payload);

  const stats = {
    extracted: totalValid,
    matched: insertedCount,
    inserted: insertedCount,
    skipped: skippedCount,
  };

  if (catalog) {
    const update = {
      status: "published",
      quizId,
      syncedAt: new Date(),
      extractionMethod: "admin-import",
      errorMessage: null,
      stats,
      activeProvider: null,
      activeModel: null,
    };
    if (questionPdfUrl) {
      update.questionPdfUrl = questionPdfUrl;
      const fid = parseDownloadFileId(questionPdfUrl);
      if (fid) update.questionDownloadFileId = fid;
    }
    if (answerKeyPdfUrl) {
      update.answerKeyPdfUrl = answerKeyPdfUrl;
      const fid = parseDownloadFileId(answerKeyPdfUrl);
      if (fid) update.answerKeyDownloadFileId = fid;
    }

    await officialPaperCatalogModel.updateOne({ _id: catalog._id }, update);

    await quizModel.updateOne(
      { _id: quizId },
      {
        $set: {
          sourceUrls: {
            questionPdf: questionPdfUrl || catalog.questionPdfUrl,
            answerKeyPdf: answerKeyPdfUrl || catalog.answerKeyPdfUrl,
          },
          setCode: catalog.setCode || normalizeSetCode(setCode) || setCode,
          year: catalog.year || year,
          title: catalog.rsmssbTitle || title,
        },
      }
    );

    return { catalogId: catalog._id, linked: true, created: false };
  }

  if (linkMode === "existing") {
    throw new Error("Selected catalogue entry not found");
  }

  if (linkMode === "auto") {
    return { catalogId: null, linked: false, created: false };
  }

  if (linkMode === "new" && (!questionPdfUrl || !answerKeyPdfUrl)) {
    throw new Error(
      "For a new catalogue entry, provide both question paper PDF URL and answer key PDF URL"
    );
  }

  const qFid = parseDownloadFileId(questionPdfUrl) || `import-q-${Date.now()}`;
  const aFid = parseDownloadFileId(answerKeyPdfUrl) || `import-a-${Date.now()}`;

  const created = await officialPaperCatalogModel.create({
    examId,
    rsmssbTitle: title,
    year: Number(year) || new Date().getFullYear(),
    setCode: normalizeSetCode(setCode) || setCode,
    questionDownloadFileId: qFid,
    answerKeyDownloadFileId: aFid,
    questionPdfUrl: questionPdfUrl || `${DOWNLOAD_BASE}${qFid}`,
    answerKeyPdfUrl: answerKeyPdfUrl || `${DOWNLOAD_BASE}${aFid}`,
    status: "published",
    quizId,
    extractionMethod: "admin-import",
    syncedAt: new Date(),
    stats,
  });

  await quizModel.updateOne(
    { _id: quizId },
    {
      $set: {
        sourceUrls: {
          questionPdf: created.questionPdfUrl,
          answerKeyPdf: created.answerKeyPdfUrl,
        },
        setCode: created.setCode,
        year: created.year,
      },
    }
  );

  return { catalogId: created._id, linked: true, created: true };
};

module.exports = {
  listCatalogForAdmin,
  findCatalogForImport,
  resolveCatalogTarget,
  linkImportToCatalog,
  normalizeSetCode,
  parseDownloadFileId,
};
