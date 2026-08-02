const examModel = require("../models/exam.model");
const questionModel = require("../models/question.model");
const quizModel = require("../models/quiz.model");
const officialPaperCatalogModel = require("../models/officialPaperCatalog.model");
const syncJobModel = require("../models/syncJob.model");
const { getAiProviderCapabilities } = require("./ai/aiProvider.service");
const { discoverPaperPairsForExam } = require("./rsmssbScraper.service");
const { extractOfficialPaper } = require("./paperExtraction.service");
const { createSyncLogger, failStaleRunningJobs } = require("./syncLogger.service");
const { toPaperDataJson, questionDocsFromPaperData } = require("./paperDataFormatter.service");
const {
  recordProviderAttempt,
  clearProviderAttempts,
} = require("./providerAttempt.service");

const MIN_MATCH_RATIO = parseFloat(process.env.OFFICIAL_PAPER_MIN_MATCH_RATIO || "0.8");
const DURATION_MINUTES = parseInt(process.env.OFFICIAL_PAPER_DURATION_MINUTES || "120", 10);
/** 1 = one paper per job (default); 0 = all pending sequentially */
const EXTRACT_BATCH = parseInt(process.env.OFFICIAL_PAPER_EXTRACT_BATCH || "1", 10);

const yieldEventLoop = () => new Promise((resolve) => setImmediate(resolve));

const publishQuizFromQuestionDocs = async (
  catalog,
  exam,
  questionDocs,
  stats,
  extractionMethod,
  log
) => {
  const matchRatio = stats.extracted > 0 ? stats.matched / stats.extracted : 0;
  await log(
    "match_ratio",
    `Match ratio ${(matchRatio * 100).toFixed(0)}% (threshold ${MIN_MATCH_RATIO * 100}%)`,
    matchRatio >= MIN_MATCH_RATIO ? "info" : "warn"
  );

  if (matchRatio < MIN_MATCH_RATIO) {
    const errMsg = `Match ratio ${(matchRatio * 100).toFixed(0)}% below threshold ${MIN_MATCH_RATIO * 100}%`;
    await officialPaperCatalogModel.updateOne(
      { _id: catalog._id },
      {
        status: "extracted",
        extractionMethod,
        stats: {
          extracted: stats.extracted,
          matched: stats.matched,
          inserted: 0,
          skipped: stats.skipped,
        },
        errorMessage: errMsg,
        activeProvider: null,
        activeModel: null,
      }
    );
    await log("publish_skip", errMsg, "warn");
    return { published: false, failed: false, saved: true, title: catalog.rsmssbTitle, error: errMsg };
  }

  await log("db_insert", "Inserting questions into database", "info");
  const existing = await questionModel
    .find({ examId: exam._id, source: "previous-paper", year: catalog.year })
    .select("questionText")
    .lean();
  const seenTexts = new Set(existing.map((d) => d.questionText.trim().toLowerCase()));

  const toInsert = questionDocs.filter((d) => {
    const key = d.questionText.trim().toLowerCase();
    if (seenTexts.has(key)) return false;
    seenTexts.add(key);
    return true;
  });

  const inserted = await questionModel.insertMany(
    toInsert.map(({ qNo, ...rest }) => rest)
  );
  const questionIds = inserted.map((q) => q._id);

  const title = catalog.rsmssbTitle.replace(/\s+/g, " ").trim();
  await log("quiz_create", `Creating official-paper quiz with ${questionIds.length} questions`, "info");

  const quiz = await quizModel.create({
    examId: exam._id,
    topicId: null,
    type: "official-paper",
    title,
    year: catalog.year,
    setCode: catalog.setCode,
    durationMinutes: DURATION_MINUTES,
    sourceUrls: {
      questionPdf: catalog.questionPdfUrl,
      answerKeyPdf: catalog.answerKeyPdfUrl,
    },
    questions: questionIds,
    createdBy: null,
    pullRule: { sections: [] },
  });

  await officialPaperCatalogModel.updateOne(
    { _id: catalog._id },
    {
      status: "published",
      extractionMethod,
      quizId: quiz._id,
      syncedAt: new Date(),
      stats: {
        extracted: stats.extracted,
        matched: stats.matched,
        inserted: inserted.length,
        skipped: stats.skipped,
      },
      errorMessage: null,
      activeProvider: null,
      activeModel: null,
      pageProgress: null,
    }
  );

  await log("published", `Published quiz ${quiz._id}`, "info");
  return { published: true, failed: false, saved: true, title: catalog.rsmssbTitle };
};

const processCatalogEntry = async (
  catalog,
  exam,
  jobId,
  preferredProvider = null,
  options = {}
) => {
  const { publishQuiz = true, publishOnly = false, forceReExtract = true, fillMissing = false } =
    options;
  const { log } = createSyncLogger({
    jobId,
    catalogId: catalog._id,
    paperTitle: catalog.rsmssbTitle,
  });

  if (!publishOnly) {
    await clearProviderAttempts(catalog._id);
  }

  const providerLabel = preferredProvider
    ? ` via ${preferredProvider}`
    : " (auto providers)";

  await officialPaperCatalogModel.updateOne(
    { _id: catalog._id },
    {
      status: "extracting",
      errorMessage: null,
      activeProvider: preferredProvider || null,
      activeModel: preferredProvider ? require("./ai/providerMeta").getProviderMeta(preferredProvider).model : null,
    }
  );

  try {
    if (publishOnly) {
      if (!catalog.paperData?.questions?.length) {
        const errMsg = "No paperData in DB — run extract first";
        await log("publish_only", errMsg, "error");
        return { published: false, failed: true, saved: false, title: catalog.rsmssbTitle, error: errMsg };
      }
      await log("publish_only", "Publishing quiz from saved paperData (no re-OCR)", "info");
      const questionDocs = questionDocsFromPaperData(catalog.paperData, exam, catalog);
      const stats = catalog.paperData.stats || catalog.stats || {
        extracted: catalog.paperData.questions.length,
        matched: questionDocs.length,
        skipped: 0,
      };
      const extractionMethod = catalog.extractionMethod || catalog.paperData.extractionMethod;
      return publishQuizFromQuestionDocs(
        catalog,
        exam,
        questionDocs,
        stats,
        extractionMethod,
        log
      );
    }

    const hasCachedPaperData =
      !forceReExtract && !fillMissing && catalog.paperData?.questions?.length > 0;

    if (hasCachedPaperData) {
      await log(
        "extract_skip",
        `Using saved paperData (${catalog.paperData.questions.length} questions) — skip re-OCR`,
        "info"
      );
      const questionDocs = questionDocsFromPaperData(catalog.paperData, exam, catalog);
      const stats = catalog.paperData.stats || catalog.stats || {
        extracted: catalog.paperData.questions.length,
        matched: questionDocs.length,
        skipped: 0,
      };
      const extractionMethod = catalog.extractionMethod || catalog.paperData.extractionMethod;
      if (!publishQuiz) {
        await officialPaperCatalogModel.updateOne(
          { _id: catalog._id },
          { status: "extracted", errorMessage: null, activeProvider: null, activeModel: null }
        );
        return { published: false, failed: false, saved: true, title: catalog.rsmssbTitle };
      }
      return publishQuizFromQuestionDocs(
        catalog,
        exam,
        questionDocs,
        stats,
        extractionMethod,
        log
      );
    }

    await log(
      "extract_start",
      `Starting extraction${providerLabel}: ${catalog.rsmssbTitle}`,
      "info",
      preferredProvider || undefined
    );

    const onProviderAttempt = async (attempt) => {
      await recordProviderAttempt(catalog._id, attempt);
    };

    let existingQuestionDocs = [];
    if (fillMissing && catalog.paperData?.questions?.length) {
      existingQuestionDocs = questionDocsFromPaperData(catalog.paperData, exam, catalog);
      const target = parseInt(process.env.OFFICIAL_PAPER_EXPECTED_QUESTIONS || "150", 10);
      await log(
        "fill_missing",
        `Re-OCR to sync remaining questions (have ${existingQuestionDocs.length}, target ${target})`,
        "info"
      );
    }

    const { questionDocs, stats, extractionMethod } = await extractOfficialPaper({
      exam,
      questionPdfUrl: catalog.questionPdfUrl,
      answerKeyPdfUrl: catalog.answerKeyPdfUrl,
      paperYear: catalog.year,
      onLog: log,
      preferredProvider,
      onProviderAttempt,
      fillMissing,
      existingQuestionDocs,
    });

    const catalogWithAttempts = await officialPaperCatalogModel
      .findById(catalog._id)
      .lean();
    const paperData = toPaperDataJson({
      catalog,
      extractionMethod,
      stats,
      questionDocs,
      providerAttempts: catalogWithAttempts?.providerAttempts || [],
    });
    await officialPaperCatalogModel.updateOne({ _id: catalog._id }, { paperData });
    await log(
      "paper_data",
      `Saved paper_data to DB (${questionDocs.length} questions)`,
      "info"
    );

    await officialPaperCatalogModel.updateOne(
      { _id: catalog._id },
      {
        status: "extracted",
        extractionMethod,
        stats: {
          extracted: stats.extracted,
          matched: stats.matched,
          inserted: 0,
          skipped: stats.skipped,
        },
        errorMessage: null,
        activeProvider: null,
        activeModel: null,
        pageProgress: null,
      }
    );

    if (!publishQuiz) {
      await log("extract_done", "Extraction saved to DB (quiz publish skipped)", "info");
      return { published: false, failed: false, saved: true, title: catalog.rsmssbTitle };
    }

    return publishQuizFromQuestionDocs(
      catalog,
      exam,
      questionDocs,
      stats,
      extractionMethod,
      log
    );
  } catch (err) {
    await officialPaperCatalogModel.updateOne(
      { _id: catalog._id },
      { status: "failed", errorMessage: err.message, activeProvider: null, activeModel: null, pageProgress: null }
    );
    await log("failed", err.message, "error");
    return { published: false, failed: true, saved: false, title: catalog.rsmssbTitle, error: err.message };
  }
};

/**
 * Phase 1 — fetch ALL archive URLs, then save each paper link to DB one by one.
 */
const runLinkSyncJob = async (jobId, examId) => {
  const { log } = createSyncLogger({ jobId });
  const exam = await examModel.findById(examId);

  if (!exam) {
    await syncJobModel.updateOne(
      { _id: jobId },
      { status: "failed", finishedAt: new Date(), errorLog: ["Exam not found"] }
    );
    return;
  }

  try {
    await log("fetch_urls", `Phase 1a: Downloading RSMSSB archive pages for ${exam.slug}`, "info");

    const { qpLinks, akLinks, pairs } = await discoverPaperPairsForExam(exam.slug);

    await log(
      "fetch_urls",
      `Phase 1a done — ${qpLinks.length} question PDF URL(s), ${akLinks.length} answer-key URL(s) on site`,
      "info"
    );
    await log(
      "pair_urls",
      `Phase 1b: Matched ${pairs.length} CET paper pair(s) for ${exam.slug}`,
      "info"
    );

    await syncJobModel.updateOne(
      { _id: jobId },
      {
        progress: {
          total: pairs.length,
          completed: 0,
          published: 0,
          failed: 0,
        },
        currentStage: "save_links",
      }
    );

    const existingIds = await officialPaperCatalogModel
      .find({ examId })
      .select("questionDownloadFileId")
      .lean();
    const seen = new Set(existingIds.map((e) => e.questionDownloadFileId));

    let completed = 0;
    let linked = 0;
    let skipped = 0;

    for (const p of pairs) {
      completed++;
      await syncJobModel.updateOne(
        { _id: jobId },
        {
          currentPaper: p.rsmssbTitle,
          currentStage: "save_link",
          progress: {
            total: pairs.length,
            completed,
            published: linked,
            failed: 0,
          },
        }
      );

      if (seen.has(p.questionDownloadFileId)) {
        skipped++;
        await log("link_skip", `Already stored — skipped: ${p.rsmssbTitle}`, "info");
        await yieldEventLoop();
        continue;
      }

      await officialPaperCatalogModel.create({
        examId,
        ...p,
        status: "linked",
        currentStage: "linked",
      });
      seen.add(p.questionDownloadFileId);
      linked++;

      await log(
        "link_stored",
        `Saved link #${linked} (${completed}/${pairs.length}): ${p.rsmssbTitle}`,
        "info"
      );
      await yieldEventLoop();
    }

    await syncJobModel.updateOne(
      { _id: jobId },
      {
        status: "completed",
        currentPaper: null,
        currentStage: "fetch_links_done",
        finishedAt: new Date(),
        progress: {
          total: pairs.length,
          completed: pairs.length,
          published: linked,
          failed: 0,
        },
      }
    );
    await log(
      "fetch_links",
      `Phase 1 complete — ${linked} new link(s) saved, ${skipped} already existed`,
      "info"
    );
  } catch (err) {
    await log("fetch_links", `Phase 1 failed: ${err.message}`, "error");
    await syncJobModel.updateOne(
      { _id: jobId },
      {
        status: "failed",
        finishedAt: new Date(),
        errorLog: [err.message],
      }
    );
  }
};

/**
 * Phase 2 — process each linked paper one by one (download PDF → AI → quiz).
 */
const runExtractSyncJob = async (
  jobId,
  examId,
  {
    catalogId = null,
    extractAll = false,
    preferredProvider = null,
    publishOnly = false,
    publishQuiz = true,
    forceReExtract = true,
    fillMissing = false,
  } = {}
) => {
  const effectiveProvider =
    preferredProvider || process.env.DEFAULT_EXTRACT_PROVIDER || "ocr";
  const { log } = createSyncLogger({ jobId });
  const exam = await examModel.findById(examId);

  if (!exam) {
    await syncJobModel.updateOne(
      { _id: jobId },
      { status: "failed", finishedAt: new Date(), errorLog: ["Exam not found"] }
    );
    return;
  }

  try {
    let toProcess;

    if (catalogId) {
      const catalog = await officialPaperCatalogModel.findOne({ _id: catalogId, examId });
      if (!catalog) {
        await log("extract", "Paper catalog entry not found", "error");
        await syncJobModel.updateOne(
          { _id: jobId },
          { status: "failed", finishedAt: new Date(), errorLog: ["Paper not found"] }
        );
        return;
      }
      if (catalog.status === "published" && !publishOnly) {
        await log("extract", "Paper already published", "warn");
        await syncJobModel.updateOne(
          { _id: jobId },
          { status: "completed", finishedAt: new Date(), currentStage: "extract_skip" }
        );
        return;
      }
      toProcess = [catalog];
    } else {
      const query = officialPaperCatalogModel
        .find({
          examId,
          status: { $in: ["linked", "failed", "pending"] },
        })
        .sort({ year: -1 });

      toProcess =
        extractAll || EXTRACT_BATCH === 0
          ? await query
          : await query.limit(EXTRACT_BATCH);
    }

    if (toProcess.length === 0) {
      await log("extract", "No papers waiting for extraction (linked/failed/pending)", "warn");
      await syncJobModel.updateOne(
        { _id: jobId },
        {
          status: "completed",
          currentStage: "extract_none",
          finishedAt: new Date(),
        }
      );
      return;
    }

    await log(
      "extract",
      `Phase 2: Processing ${toProcess.length} paper(s) sequentially (one PDF at a time)`,
      "info"
    );

    await syncJobModel.updateOne(
      { _id: jobId },
      {
        progress: {
          total: toProcess.length,
          completed: 0,
          published: 0,
          failed: 0,
        },
        currentStage: "extracting",
      }
    );

    let completed = 0;
    let published = 0;
    let failed = 0;
    const errorLog = [];

    for (const catalog of toProcess) {
      await syncJobModel.updateOne(
        { _id: jobId },
        {
          currentPaper: catalog.rsmssbTitle,
          currentCatalogId: catalog._id,
          currentStage: "extracting",
          pageProgress: {
            current: 0,
            total: 0,
            phase: "starting",
            questionsFound: 0,
            updatedAt: new Date(),
          },
          progress: {
            total: toProcess.length,
            completed,
            published,
            failed,
          },
        }
      );

      const result = await processCatalogEntry(catalog, exam, jobId, effectiveProvider, {
        publishOnly,
        publishQuiz,
        forceReExtract: fillMissing ? true : forceReExtract,
        fillMissing,
      });
      completed++;
      if (result.published) published++;
      if (result.failed) {
        failed++;
        if (result.error) errorLog.push(`${result.title}: ${result.error}`);
      }

      await syncJobModel.updateOne(
        { _id: jobId },
        {
          progress: {
            total: toProcess.length,
            completed,
            published,
            failed,
          },
        }
      );

      if (global.gc) {
        try {
          global.gc();
        } catch {
          /* ignore */
        }
      }
      await yieldEventLoop();
    }

    await syncJobModel.updateOne(
      { _id: jobId },
      {
        status: failed > 0 && published === 0 ? "failed" : "completed",
        currentPaper: null,
        currentCatalogId: null,
        currentStage: "extract_done",
        pageProgress: null,
        activeProvider: null,
        activeModel: null,
        finishedAt: new Date(),
        errorLog,
      }
    );
    await log(
      "extract",
      `Phase 2 complete — published: ${published}, failed: ${failed}`,
      failed > 0 ? "warn" : "info"
    );
  } catch (err) {
    await log("extract", `Phase 2 crashed: ${err.message}`, "error");
    await syncJobModel.updateOne(
      { _id: jobId },
      {
        status: "failed",
        finishedAt: new Date(),
        errorLog: [err.message],
      }
    );
  }
};

const startJob = async (examId, userId, phase, extractOpts = {}) => {
  await failStaleRunningJobs(examId);

  const running = await syncJobModel.findOne({ examId, status: "running" });
  if (running) {
    return { jobId: running._id, alreadyRunning: true };
  }

  const preferredProvider =
    extractOpts.preferredProvider || extractOpts.provider || null;

  const job = await syncJobModel.create({
    examId,
    triggeredBy: userId,
    status: "running",
    phase,
    preferredProvider: preferredProvider || null,
    progress: { total: 0, completed: 0, published: 0, failed: 0 },
    stageLogs: [],
  });

  if (phase === "fetch_links") {
    setImmediate(() => runLinkSyncJob(job._id, examId));
  } else if (phase === "extract") {
    setImmediate(() => runExtractSyncJob(job._id, examId, extractOpts));
  }

  return { jobId: job._id, alreadyRunning: false, phase, preferredProvider };
};

const startLinkSync = (examId, userId) => startJob(examId, userId, "fetch_links");
const startExtractSync = (examId, userId, options = {}) =>
  startJob(examId, userId, "extract", options);

/** Legacy: runs link fetch only (use extract separately). */
const startSync = (examId, userId) => startLinkSync(examId, userId);

const getSyncJobStatus = async (jobId) => {
  const job = await syncJobModel.findById(jobId).lean();
  if (!job) throw new Error("Sync job not found");

  let livePaper = null;
  if (job.currentCatalogId) {
    const c = await officialPaperCatalogModel.findById(job.currentCatalogId).lean();
    if (c) {
      livePaper = {
        catalogId: String(c._id),
        title: c.rsmssbTitle,
        status: c.status,
        currentStage: c.currentStage,
        pageProgress: c.pageProgress,
        stats: c.stats,
        stageLogs: (c.stageLogs || []).slice(-20),
      };
    }
  }

  return {
    ...job,
    errors: job.errorLog || [],
    livePaper,
  };
};

const extractCatalogById = async (catalogId, preferredProvider = "ocr", options = {}) => {
  const catalog = await officialPaperCatalogModel.findById(catalogId);
  if (!catalog) throw new Error("Catalog not found");
  const exam = await examModel.findById(catalog.examId);
  if (!exam) throw new Error("Exam not found");
  return processCatalogEntry(catalog, exam, null, preferredProvider, {
    publishQuiz: options.publishQuiz !== false,
    publishOnly: Boolean(options.publishOnly),
    forceReExtract: options.fillMissing ? true : options.forceReExtract !== false,
    fillMissing: Boolean(options.fillMissing),
  });
};

module.exports = {
  startSync,
  startLinkSync,
  startExtractSync,
  getSyncJobStatus,
  getAiProviderCapabilities,
  processCatalogEntry,
  extractCatalogById,
};
