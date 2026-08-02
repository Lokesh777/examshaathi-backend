const syncJobModel = require("../models/syncJob.model");
const officialPaperCatalogModel = require("../models/officialPaperCatalog.model");
const { getProviderMeta } = require("./ai/providerMeta");

const STALE_JOB_MS = parseInt(process.env.SYNC_JOB_STALE_MS || "1800000", 10);

const formatLogLine = (prefix, stage, message, level) => {
  const ts = new Date().toISOString();
  const tag = level === "error" ? "ERROR" : level === "warn" ? "WARN" : "INFO";
  return `[${ts}] [OldPaper:${prefix}:${stage}] [${tag}] ${message}`;
};

const parsePageProgressFromMessage = (stage, message) => {
  if (!message) return null;
  const pageMatch = message.match(/page\s+(\d+)\s*\/\s*(\d+)/i);
  const totalOnlyMatch = message.match(/(\d+)\s*\/\s*(\d+)\s*page/i);
  const questionsMatch = message.match(/(\d+)\s+questions?\s+so\s+far/i);

  let current = 0;
  let total = 0;
  if (pageMatch) {
    current = parseInt(pageMatch[1], 10);
    total = parseInt(pageMatch[2], 10);
  } else if (totalOnlyMatch) {
    total = parseInt(totalOnlyMatch[2], 10);
    current = parseInt(totalOnlyMatch[1], 10);
  }

  if (total <= 0) return null;

  const questionsFound = questionsMatch ? parseInt(questionsMatch[1], 10) : undefined;
  return {
    current,
    total,
    phase: stage,
    questionsFound,
  };
};

const updatePageProgress = async (jobId, catalogId, progress) => {
  const payload = {
    pageProgress: {
      ...progress,
      updatedAt: new Date(),
    },
    currentStage: progress.phase
      ? `${progress.phase} ${progress.current}/${progress.total}`
      : `page ${progress.current}/${progress.total}`,
  };

  if (jobId) {
    await syncJobModel.updateOne({ _id: jobId }, { $set: payload });
  }
  if (catalogId) {
    await officialPaperCatalogModel.updateOne({ _id: catalogId }, { $set: payload });
  }
};

const pushJobLog = async (jobId, entry) => {
  if (!jobId) return;
  const update = {
    $set: { currentStage: entry.stage },
    $push: {
      stageLogs: {
        $each: [entry],
        $slice: -100,
      },
    },
  };
  if (entry.provider) {
    const meta = getProviderMeta(entry.provider);
    update.$set.activeProvider = entry.provider;
    update.$set.activeModel = meta.model;
  }
  await syncJobModel.updateOne({ _id: jobId }, update);
};

const pushCatalogLog = async (catalogId, entry) => {
  if (!catalogId) return;
  const update = {
    $set: { currentStage: entry.stage },
    $push: {
      stageLogs: {
        $each: [entry],
        $slice: -50,
      },
    },
  };
  if (entry.provider) {
    const meta = getProviderMeta(entry.provider);
    update.$set.activeProvider = entry.provider;
    update.$set.activeModel = meta.model;
  }
  await officialPaperCatalogModel.updateOne({ _id: catalogId }, update);
};

const createSyncLogger = ({ jobId, catalogId, paperTitle }) => {
  const prefix = paperTitle ? paperTitle.slice(0, 40) : jobId ? `job-${jobId}` : "sync";

  const log = async (stage, message, level = "info", provider = null) => {
    const line = formatLogLine(prefix, stage, message, level);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);

    const entry = {
      stage,
      message,
      level,
      provider: provider || undefined,
      at: new Date(),
    };
    await pushJobLog(jobId, entry);
    if (catalogId) await pushCatalogLog(catalogId, entry);

    const pageProgress = parsePageProgressFromMessage(stage, message);
    if (pageProgress && (jobId || catalogId)) {
      await updatePageProgress(jobId, catalogId, pageProgress);
    }
  };

  return { log };
};

const failStaleRunningJobs = async (examId) => {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);
  const result = await syncJobModel.updateMany(
    { examId, status: "running", updatedAt: { $lt: cutoff } },
    {
      $set: {
        status: "failed",
        finishedAt: new Date(),
        currentStage: "stale_timeout",
        currentPaper: null,
        currentCatalogId: null,
      },
      $push: {
        errorLog: {
          $each: ["Job timed out — marked failed (stale). Start extract again."],
        },
      },
    }
  );
  return result.modifiedCount;
};

module.exports = {
  createSyncLogger,
  formatLogLine,
  failStaleRunningJobs,
  updatePageProgress,
  STALE_JOB_MS,
};
