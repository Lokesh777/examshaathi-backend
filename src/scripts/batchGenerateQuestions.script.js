// Kya hoga: har weighted topic (37 topics jo shortfall me the) pe loop chalega, har ek ke liye weightage × 1.5 (minimum 15) questions generate karega — taaki real-paper mock ke alawa topic-wise practice quiz ke liye bhi variety rahe ($sample ko choose karne ke liye options milein).
require("dotenv").config();
const mongoose = require("mongoose");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");
const { generateQuestionsForTopic } = require("../services/questionGeneration.service");

const examSlug = process.argv[2];
const bufferMultiplier = parseFloat(process.argv[3]) || 1; // default ab 1, no extra buffer

if (!examSlug) {
  console.error("Usage: node batchGenerateQuestions.script.js <examSlug> [bufferMultiplier]");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("DB connected");

    const exam = await examModel.findOne({ slug: examSlug });
    if (!exam) {
      console.error(`No exam found: ${examSlug}`);
      process.exit(1);
    }

    const topics = await topicModel.find({
      examId: exam._id,
      deprecated: false,
      weightage: { $ne: null },
    }).sort({ order: 1 });

    console.log(`Found ${topics.length} weighted topics. Starting batch generation...\n`);

    for (let i = 0; i < topics.length; i++) {
      const topic = topics[i];
      // target: enough questions for the real-paper pull PLUS room for
      // topic-practice quizzes to sample fresh sets — weightage * buffer, min 15
    const target = Math.max(Math.ceil(topic.weightage * bufferMultiplier), 1); // min 15 hataya, ab sirf weightage jitna hi

      console.log(`[${i + 1}/${topics.length}] ${topic.name} — target: ${target}`);

      const result = await generateQuestionsForTopic(topic, exam, target);

      if (result.skipped) {
        console.log(`  Already sufficient (${result.finalCount})`);
      } else {
        console.log(`  Inserted ${result.inserted}, bank now: ${result.finalCount}/${target}`);
      }

      // small pause between topics — polite to the API, avoids rate-limit bursts
      await sleep(1000);
    }

    console.log("\nBatch generation complete.");
    process.exit(0);
  } catch (err) {
    console.error("Script failed:", err.message);
    process.exit(1);
  }
};

run();
