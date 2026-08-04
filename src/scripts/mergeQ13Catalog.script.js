/**
 * One-off: link admin-imported Q13 quiz to failed catalogue entry.
 * Usage: node src/scripts/mergeQ13Catalog.script.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const officialPaperCatalogModel = require("../models/officialPaperCatalog.model");
const quizModel = require("../models/quiz.model");

const CATALOG_ID = "6a6e3985a884b97d6c22125b";
const QUIZ_ID = "6a6f78051e34de60d0105927";
const EXAM_ID = "6a5c484b0441e977d52336f7";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const catalog = await officialPaperCatalogModel.findById(CATALOG_ID);
  const quiz = await quizModel.findById(QUIZ_ID);

  if (!catalog) throw new Error(`Catalog ${CATALOG_ID} not found`);
  if (!quiz) throw new Error(`Quiz ${QUIZ_ID} not found`);

  const questionCount = quiz.questions?.length || 0;
  console.log("Catalog:", catalog.rsmssbTitle, catalog.setCode, catalog.status);
  console.log("Quiz:", quiz.title, questionCount, "questions");

  await quizModel.updateOne(
    { _id: QUIZ_ID },
    {
      $set: {
        title: catalog.rsmssbTitle.replace(/\s+/g, " ").trim(),
        year: catalog.year,
        setCode: catalog.setCode,
        durationMinutes: 120,
        sourceUrls: {
          questionPdf: catalog.questionPdfUrl,
          answerKeyPdf: catalog.answerKeyPdfUrl,
        },
      },
    }
  );

  await officialPaperCatalogModel.updateOne(
    { _id: CATALOG_ID },
    {
      $set: {
        status: "published",
        quizId: new mongoose.Types.ObjectId(QUIZ_ID),
        extractionMethod: "admin-import",
        errorMessage: null,
        currentStage: null,
        activeProvider: null,
        activeModel: null,
        syncedAt: new Date(),
        stats: {
          extracted: questionCount,
          matched: questionCount,
          inserted: questionCount,
          skipped: 0,
        },
      },
    }
  );

  // Remove duplicate Q13 catalog rows that have no quiz (if any)
  const dupes = await officialPaperCatalogModel.find({
    examId: EXAM_ID,
    setCode: /^Q13$/i,
    _id: { $ne: CATALOG_ID },
    quizId: null,
  });
  for (const d of dupes) {
    console.log("Removing empty duplicate catalog:", d._id, d.rsmssbTitle);
    await officialPaperCatalogModel.deleteOne({ _id: d._id });
  }

  const otherQ13Quizzes = await quizModel.find({
    examId: EXAM_ID,
    type: "official-paper",
    setCode: /^Q13$/i,
    _id: { $ne: QUIZ_ID },
  });
  for (const q of otherQ13Quizzes) {
    console.log("Orphan duplicate quiz (not deleted, unlink only):", q._id, q.title);
  }

  const updated = await officialPaperCatalogModel.findById(CATALOG_ID).lean();
  const updatedQuiz = await quizModel.findById(QUIZ_ID).lean();
  console.log("\nDone.");
  console.log("Catalog status:", updated.status, "quizId:", updated.quizId);
  console.log("Quiz title:", updatedQuiz.title);
  console.log("Questions:", updatedQuiz.questions?.length);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
