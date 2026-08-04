/**
 * Fetch CET syllabus topics and merge NEW ones only (no delete, no duplicate).
 * Usage: node src/scripts/mergeSyllabusTopics.script.js cet-12th [--dry-run]
 */
require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const examSlug = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!examSlug) {
  console.error("Usage: node src/scripts/mergeSyllabusTopics.script.js <exam-slug> [--dry-run]");
  process.exit(1);
}

const normalizeTopicKey = (s) =>
  (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[।.,;:!?'"()]/g, "");

const tavilySearch = async (query) => {
  const res = await axios.post(
    "https://api.tavily.com/search",
    {
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "advanced",
      max_results: 8,
    },
    { timeout: 45000 }
  );
  return res.data.results.map((r) => `${r.title}\n${r.content}`).join("\n\n");
};

const extractTopicsWithDedup = async (examName, rawText, existingTopics, sectionNames) => {
  const existingList =
    existingTopics.length > 0
      ? existingTopics.map((t, i) => `${i + 1}. ${t.name}`).join("\n")
      : "(none yet)";

  const sectionsList = sectionNames.length
    ? sectionNames.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "(classify later)";

  const prompt = `You are updating the syllabus topic bank for "${examName}" (Rajasthan CET 12th / Senior Secondary Level).

Extract GRANULAR chapter-level topics in HINDI (Devanagari) from the source text below.
Official broad areas include: Rajasthan History/Art/Culture, Geography (India + Rajasthan), Polity (India + Rajasthan focus), Rajasthan Economy, Everyday Science, Reasoning & Mental Ability, General Hindi, General English, Computer, Current Affairs, Public Health (if mentioned).

EXISTING TOPICS (do NOT duplicate — match by meaning even if wording differs):
${existingList}

EXAM PATTERN SECTIONS (assign each NEW topic to best section index, 1-based):
${sectionsList}

For each extracted topic:
- If it means the SAME as an existing topic, set "matchesExistingIndex" to that number and skip inserting.
- If genuinely NEW, set "matchesExistingIndex" to null and provide "patternSectionIndex" (1-based).

Return ONLY valid JSON:
{
  "qualityNotes": "brief note on source quality",
  "pattern": {
    "totalQuestions": 150,
    "sections": [
      { "topicName": "English section name", "questionCount": 150, "marks": 300 }
    ]
  },
  "topics": [
    {
      "name": "हिंदी में विषय",
      "matchesExistingIndex": null,
      "patternSectionIndex": 1,
      "suggestedWeightage": null
    }
  ]
}

Raw text:
"""
${rawText.slice(0, 28000)}
"""`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.15,
    max_tokens: 8192,
  });

  const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
};

const localDedup = (name, existingTopics) => {
  const key = normalizeTopicKey(name);
  if (!key) return true;
  return existingTopics.some((t) => {
    const ek = normalizeTopicKey(t.name);
    return ek === key || ek.includes(key) || key.includes(ek);
  });
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 60000,
  });
  console.log("DB connected", dryRun ? "(DRY RUN)" : "");

  const exam = await examModel.findOne({ slug: examSlug });
  if (!exam) {
    console.error(`No exam: ${examSlug}`);
    process.exit(1);
  }

  const existingTopics = await topicModel
    .find({ examId: exam._id, deprecated: false })
    .sort({ order: 1 });

  console.log(`Exam: ${exam.name}`);
  console.log(`Existing topics: ${existingTopics.length}`);

  const queries = [
    "RSMSSB Rajasthan CET Senior Secondary Level 12th syllabus detailed topics Hindi 2024",
    "राजस्थान सीईटी 12वीं स्तर पाठ्यक्रम विषयवार सूची RSSB",
    "Rajasthan CET 12th level exam pattern 150 questions syllabus PDF topics",
  ];

  let combined = "";
  for (const q of queries) {
    console.log(`Searching: ${q.slice(0, 60)}...`);
    try {
      combined += `\n\n--- ${q} ---\n` + (await tavilySearch(q));
    } catch (e) {
      console.warn(`Tavily skip: ${e.message}`);
    }
  }

  if (combined.trim().length < 200) {
    throw new Error("Insufficient syllabus text from search");
  }

  const sectionNames =
    exam.pattern?.sections?.map((s) => s.topicName) || [
      "Rajasthan History, Art, Culture, Literature, Tradition and Heritage",
      "Geography of India and Rajasthan",
      "Indian Political System with Special Reference to Rajasthan",
      "Economy of Rajasthan",
      "Everyday Science",
      "Logical Reasoning and Mental Ability",
      "General Hindi",
      "General English",
      "Computer Knowledge",
      "Current Affairs",
    ];

  const structured = await extractTopicsWithDedup(
    exam.name,
    combined,
    existingTopics,
    sectionNames
  );

  console.log("\nQuality:", structured.qualityNotes || "(no notes)");

  const maxOrderDoc = await topicModel.findOne({ examId: exam._id }).sort({ order: -1 });
  let nextOrder = (maxOrderDoc?.order || existingTopics.length) + 1;

  const toInsert = [];
  const skipped = [];

  for (const t of structured.topics || []) {
    const name = (t.name || "").trim();
    if (!name) continue;

    if (t.matchesExistingIndex != null && existingTopics[t.matchesExistingIndex - 1]) {
      skipped.push({ name, reason: `AI matched #${t.matchesExistingIndex}` });
      continue;
    }

    if (localDedup(name, existingTopics) || localDedup(name, toInsert)) {
      skipped.push({ name, reason: "local fuzzy duplicate" });
      continue;
    }

    const sectionIdx = (t.patternSectionIndex || 1) - 1;
    const patternSection = sectionNames[sectionIdx] || sectionNames[0] || null;

    toInsert.push({
      examId: exam._id,
      name,
      order: nextOrder++,
      patternSection,
      weightage: t.suggestedWeightage ?? null,
      weightageConfidence: t.suggestedWeightage ? "estimated" : null,
    });
  }

  console.log(`\nProposed NEW topics: ${toInsert.length}`);
  console.log(`Skipped (duplicate): ${skipped.length}`);
  toInsert.forEach((t, i) =>
    console.log(`  + ${i + 1}. ${t.name} [${t.patternSection || "—"}]`)
  );

  if (!dryRun && toInsert.length > 0) {
    await topicModel.insertMany(toInsert);
    console.log(`\nInserted ${toInsert.length} topics.`);
  } else if (dryRun) {
    console.log("\nDry run — nothing written.");
  } else {
    console.log("\nNo new topics to insert.");
  }

  // Update pattern only if exam has none or totalQuestions mismatch on official 150 CET
  if (
    !dryRun &&
    structured.pattern?.sections?.length &&
    (!exam.pattern?.sections?.length || exam.pattern?.totalQuestions !== 150)
  ) {
    exam.pattern = structured.pattern;
    exam.syllabusStatus = "ready";
    await exam.save();
    console.log("Updated exam.pattern:", JSON.stringify(structured.pattern, null, 2));
  }

  const total = await topicModel.countDocuments({ examId: exam._id, deprecated: false });
  console.log(`\nTotal topics now: ${total}`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
