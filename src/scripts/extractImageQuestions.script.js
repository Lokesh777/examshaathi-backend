/**
 * Extract image/diagram questions for a catalog (crop + Gemini + ImageKit fallback).
 *
 * Usage:
 *   npm run extract:image-questions -- <catalogId>
 *   npm run extract:image-questions -- <catalogId> --qNos 10,21,30
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { extractImageQuestionsForCatalog } = require("../services/imageQuestionExtraction.service");

const args = process.argv.slice(2);
const catalogId = args[0];
const qNosArg = args.find((a) => a.startsWith("--qNos="));
const qNos = qNosArg
  ? qNosArg
      .replace("--qNos=", "")
      .split(",")
      .map((n) => parseInt(n.trim(), 10))
      .filter(Boolean)
  : null;

if (!catalogId) {
  console.error("Usage: npm run extract:image-questions -- <catalogId> [--qNos=30,45]");
  process.exit(1);
}

const log = async (stage, message, level = "info") => {
  const tag = level === "error" ? "ERROR" : level === "warn" ? "WARN" : "INFO";
  console.log(`[${tag}] [${stage}] ${message}`);
};

const main = async () => {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  const result = await extractImageQuestionsForCatalog(catalogId, qNos, log);
  console.log("---");
  console.log(`Image questions extracted: ${result.extracted}`);
  console.log(`Total in paperData: ${result.merged}`);
  console.log(`Missing count: ${result.paperData?.stats?.missingCount ?? "—"}`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
