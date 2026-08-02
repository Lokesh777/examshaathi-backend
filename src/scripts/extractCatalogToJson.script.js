/**
 * Extract one catalog entry → saves paperData to MongoDB (+ optional quiz publish).
 *
 * Usage:
 *   npm run extract:catalog -- <catalogId> [provider]        # extract + save DB
 *   npm run extract:catalog -- <catalogId> ocr --publish     # extract + save + publish quiz
 *
 * Output files (always):
 *   backend/output/paper_data-<catalogId>.json
 *   backend/output/extract-<catalogId>.json
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const officialPaperCatalogModel = require("../models/officialPaperCatalog.model");
const { extractCatalogById } = require("../services/officialPaperIngestion.service");

const args = process.argv.slice(2);
const publishQuiz = args.includes("--publish");
const fillMissing = args.includes("--fill-missing");
const filtered = args.filter((a) => a !== "--publish" && a !== "--fill-missing");
const catalogId = filtered[0];
const preferredProvider = filtered[1] || process.env.DEFAULT_EXTRACT_PROVIDER || "ocr";

if (!catalogId) {
  console.error("Usage: npm run extract:catalog -- <catalogId> [provider] [--publish]");
  process.exit(1);
}

const writeOutputs = (catalogId, payload) => {
  const outDir = path.join(__dirname, "../../output");
  fs.mkdirSync(outDir, { recursive: true });
  const extractFile = path.join(outDir, `extract-${catalogId}.json`);
  const paperDataFile = path.join(outDir, `paper_data-${catalogId}.json`);
  fs.writeFileSync(extractFile, JSON.stringify(payload, null, 2), "utf8");
  const paperDataOnly = {
    title: payload.title,
    year: payload.year,
    setCode: payload.setCode,
    extractionMethod: payload.extractionMethod,
    stats: payload.stats,
    questions: payload.questions,
  };
  fs.writeFileSync(paperDataFile, JSON.stringify(paperDataOnly, null, 2), "utf8");
  return { extractFile, paperDataFile };
};

const main = async () => {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  const catalogBefore = await officialPaperCatalogModel.findById(catalogId).lean();
  if (!catalogBefore) {
    console.error(`Catalog not found: ${catalogId}`);
    process.exit(1);
  }

  console.log(`Paper: ${catalogBefore.rsmssbTitle}`);
  console.log(`Provider: ${preferredProvider}`);
  console.log(`Save to DB: yes · Publish quiz: ${publishQuiz ? "yes" : "no"} · Fill missing: ${fillMissing ? "yes" : "no"}`);
  if (process.env.OFFICIAL_PAPER_MAX_PAGES) {
    console.log(`Page cap: OFFICIAL_PAPER_MAX_PAGES=${process.env.OFFICIAL_PAPER_MAX_PAGES}`);
  }
  console.log("---");

  const start = Date.now();
  const result = await extractCatalogById(catalogId, preferredProvider, {
    publishQuiz,
    forceReExtract: fillMissing ? true : true,
    fillMissing,
  });

  const catalog = await officialPaperCatalogModel.findById(catalogId).lean();
  const paperData = catalog?.paperData;
  const payload = {
    success: result.saved || result.published,
    saved: result.saved,
    published: result.published,
    failed: result.failed,
    error: result.error,
    catalogId,
    title: catalog?.rsmssbTitle,
    year: catalog?.year,
    setCode: catalog?.setCode,
    status: catalog?.status,
    quizId: catalog?.quizId?.toString(),
    extractionMethod: catalog?.extractionMethod || paperData?.extractionMethod,
    stats: catalog?.stats || paperData?.stats,
    questions: paperData?.questions || [],
    elapsedSeconds: (Date.now() - start) / 1000,
  };

  const { extractFile, paperDataFile } = writeOutputs(catalogId, payload);
  console.log("---");
  console.log(`Done in ${payload.elapsedSeconds}s · status: ${payload.status}`);
  console.log(`DB: paperData saved (${payload.questions.length} questions)`);
  console.log(`Written: ${extractFile}`);
  console.log(`Written: ${paperDataFile}`);

  if (result.published) {
    console.log(`Published quiz ${catalog?.quizId}`);
  } else if (result.saved) {
    console.log("Extract saved to DB. Run with --publish to create quiz.");
  } else if (result.failed) {
    console.error(`Failed: ${result.error}`);
    process.exitCode = 1;
  }

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
