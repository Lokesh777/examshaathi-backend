require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");
const questionModel = require("../models/question.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const topicId = process.argv[2];
const requestedCount = parseInt(process.argv[3]) || 20;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 15;

if (!topicId) {
  console.error("Usage: node testQuestionGen.script.js <topicId> [count]");
  process.exit(1);
}

const fetchReferenceLinks = async (examName, topicName) => {
  try {
    const res = await axios.post("https://api.tavily.com/search", {
      api_key: process.env.TAVILY_API_KEY,
      query: `${examName} ${topicName} notes study material`,
      search_depth: "basic",
      max_results: 3,
    });
    return res.data.results.map((r) => r.url);
  } catch (err) {
    console.warn("Reference link fetch failed, continuing without links:", err.message);
    return [];
  }
};

const generateQuestionsWithGroq = async (examName, topicName, count, existingTexts) => {
  const avoidList = existingTexts.slice(-40);
  const avoidListText =
    avoidList.length > 0
      ? `\n\nDO NOT generate questions with the same meaning as any of these (even if worded differently):\n` +
        avoidList.map((t, i) => `${i + 1}. ${t}`).join("\n")
      : "";

  const prompt = `
You are an expert exam-question setter for "${examName}", specifically for the topic
"${topicName}" (this topic name is in Hindi).

Generate EXACTLY ${count} multiple-choice questions (MCQs) for this topic, at a difficulty
mix suitable for a competitive government exam (mix of easy, moderate, hard).

STRICT RULES:
- questionText, all 4 options, and explanation must ALL be in HINDI (Devanagari script).
- ALL NUMBERS (years, quantities, counts, dates, amounts) must be written using ENGLISH/ARABIC
  numerals (e.g. 1576, 1987, 40), NEVER Devanagari numerals (do not use १५७६ — use 1576 instead).
- Each question must have exactly 4 options.
- correctAnswer must exactly match one of the 4 options (same string).
- explanation is MANDATORY for every single question — never leave it empty.
- Do not repeat the same question twice within this batch.
- Do not generate questions that mean the same thing as an existing question, even with
  different phrasing (e.g. "प्राचीन नाम" and "पुराना नाम" asking the same fact count as duplicates).
- Keep explanation short (1-2 lines).
- Output must be COMPLETE valid JSON — do not truncate, do not cut off mid-string.
${avoidListText}

Return ONLY valid JSON, no markdown, no extra text, in this exact shape:
{
  "questions": [
    {
      "questionText": "प्रश्न यहाँ हिंदी में",
      "options": ["विकल्प 1", "विकल्प 2", "विकल्प 3", "विकल्प 4"],
      "correctAnswer": "विकल्प 2",
      "explanation": "संक्षिप्त व्याख्या",
      "difficulty": "easy"
    }
  ]
}
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
    max_tokens: 4096,
  });

  const text = completion.choices[0].message.content
    .replace(/```json|```/g, "")
    .trim();

  return JSON.parse(text);
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("DB connected");

    const topic = await topicModel.findById(topicId);
    if (!topic) {
      console.error(`No topic found with id: ${topicId}`);
      process.exit(1);
    }

    const exam = await examModel.findById(topic.examId);
    if (!exam) {
      console.error(`No exam found for this topic`);
      process.exit(1);
    }

    console.log(`Topic: ${topic.name}  |  Exam: ${exam.name}`);

    const existingDocs = await questionModel
      .find({ topicId: topic._id })
      .select("questionText")
      .lean();
    const seenTexts = new Set(
      existingDocs.map((d) => d.questionText.trim().toLowerCase())
    );
    let currentTotal = existingDocs.length;
    console.log(`Currently in bank: ${currentTotal}. Target: ${requestedCount}.`);

    if (currentTotal >= requestedCount) {
      console.log(`Bank already has enough. Skipping.`);
      process.exit(0);
    }

    const referenceLinks = await fetchReferenceLinks(exam.name, topic.name);
    console.log(`Reference links found: ${referenceLinks.length}`);

    let totalInserted = 0;
    let attempts = 0;

    while (currentTotal < requestedCount && attempts < MAX_ATTEMPTS) {
      attempts++;
      const remaining = requestedCount - currentTotal;
      const thisBatchSize = Math.min(BATCH_SIZE, remaining);
      console.log(`\nBatch #${attempts}: requesting ${thisBatchSize} (need ${remaining} more)...`);

      let structured;
      try {
        structured = await generateQuestionsWithGroq(
          exam.name,
          topic.name,
          thisBatchSize,
          Array.from(seenTexts)
        );
      } catch (err) {
        console.warn(`Batch failed (${err.message}), retrying once...`);
        try {
          structured = await generateQuestionsWithGroq(
            exam.name,
            topic.name,
            thisBatchSize,
            Array.from(seenTexts)
          );
        } catch (err2) {
          console.error(`Batch failed again, skipping: ${err2.message}`);
          continue;
        }
      }

      const validQuestions = structured.questions.filter(
        (q) => q.explanation && q.explanation.trim().length > 0
      );

      const freshQuestions = [];
      for (const q of validQuestions) {
        const key = q.questionText.trim().toLowerCase();
        if (seenTexts.has(key)) {
          console.warn(`Duplicate skipped: "${q.questionText.slice(0, 40)}..."`);
          continue;
        }
        seenTexts.add(key);
        freshQuestions.push(q);
      }

      const questionDocs = freshQuestions.map((q) => ({
        examId: exam._id,
        topicId: topic._id,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        referenceLinks,
        difficulty: q.difficulty || "moderate",
        pattern: "new",
        source: "ai",
      }));

      if (questionDocs.length > 0) {
        await questionModel.insertMany(questionDocs);
        totalInserted += questionDocs.length;
        currentTotal += questionDocs.length;
        console.log(`Inserted ${questionDocs.length} (bank total: ${currentTotal}/${requestedCount})`);
      } else {
        console.log(`No new unique questions in this batch.`);
      }
    }

    if (currentTotal < requestedCount) {
      console.warn(
        `\nStopped after ${attempts} attempts. Reached ${currentTotal}/${requestedCount}. ` +
        `Groq may be running out of genuinely new questions for this topic.`
      );
    }

    console.log(`\nDone. Inserted this run: ${totalInserted}. Final bank size: ${currentTotal}`);
    process.exit(0);
  } catch (err) {
    console.error("Script failed:", err.message);
    process.exit(1);
  }
};

run();