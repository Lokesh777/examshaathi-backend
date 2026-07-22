require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");
const questionModel = require("../models/question.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const topicId = process.argv[2];
const targetCount = parseInt(process.argv[3]) || 10;

if (!topicId) {
  console.error("Usage: node fetchPreviousPaper.script.js <topicId> [targetCount]");
  process.exit(1);
}

const tavilySearch = async (query) => {
  const res = await axios.post("https://api.tavily.com/search", {
    api_key: process.env.TAVILY_API_KEY,
    query,
    search_depth: "advanced",
    max_results: 6,
  });
  return res.data.results; // keep {content, url} pairs
};

const extractRealQuestions = async (examName, topicName, rawText, limit) => {
  const prompt = `
You are extracting REAL previous-year exam questions for "${examName}", topic "${topicName}"
(Hindi topic name), from the raw web text below.

CRITICAL RULES:
- ONLY extract questions that are LITERALLY present in the raw text below.
- DO NOT invent, guess, or generate new questions. If the text does not clearly contain
  a complete question with options and a correct answer, SKIP it — never fabricate one.
- If fewer than ${limit} genuine questions exist in the text, return only what you actually found.
  Returning fewer real questions is far better than inventing fake ones.
- Translate to HINDI (Devanagari) if source is in English, but never change the factual content.
- All numbers must be English/Arabic numerals (1576, not १५७६).
- Each question needs exactly 4 options, correctAnswer matching one option exactly.
- Include a short (1-2 line) Hindi explanation.

Return ONLY valid JSON, no markdown:
{
  "questions": [
    {
      "questionText": "...",
      "options": ["...", "...", "...", "..."],
      "correctAnswer": "...",
      "explanation": "..."
    }
  ]
}

Raw text:
"""
${rawText}
"""
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1, // low — accuracy over creativity, this is extraction not generation
    max_tokens: 4096,
  });

  const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
  return JSON.parse(text);
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("DB connected");

    const topic = await topicModel.findById(topicId);
    if (!topic) {
      console.error(`No topic found: ${topicId}`);
      process.exit(1);
    }
    const exam = await examModel.findById(topic.examId);
    console.log(`Topic: ${topic.name}  |  Exam: ${exam.name}`);

    const existingDocs = await questionModel
      .find({ topicId: topic._id, source: "previous-paper" })
      .select("questionText")
      .lean();
    const seenTexts = new Set(existingDocs.map((d) => d.questionText.trim().toLowerCase()));
    console.log(`Existing previous-paper questions for this topic: ${seenTexts.size}`);

    const results = await tavilySearch(
      `${exam.name} ${topic.name} previous year questions with answers PYQ`
    );

    if (results.length === 0) {
      console.warn("No search results found. Nothing to extract.");
      process.exit(0);
    }

    const rawText = results.map((r) => r.content).join("\n\n");
    const links = results.map((r) => r.url);

    const structured = await extractRealQuestions(exam.name, topic.name, rawText, targetCount);

    const fresh = structured.questions.filter((q) => {
      if (!q.explanation || !q.questionText) return false;
      const key = q.questionText.trim().toLowerCase();
      if (seenTexts.has(key)) {
        console.warn(`Duplicate skipped: "${q.questionText.slice(0, 40)}..."`);
        return false;
      }
      seenTexts.add(key);
      return true;
    });

    console.log(`Genuine extracted (non-duplicate): ${fresh.length} / requested ${targetCount}`);

    if (fresh.length === 0) {
      console.warn("No usable real questions found this run — Tavily results may not have had extractable Q&A. Try a different topic or search query.");
      process.exit(0);
    }

    const docs = fresh.map((q) => ({
      examId: exam._id,
      topicId: topic._id,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      referenceLinks: links,
      difficulty: "moderate",
      pattern: "old",
      source: "previous-paper",
    }));

    await questionModel.insertMany(docs);
    console.log(`Inserted ${docs.length} previous-paper questions.`);

    process.exit(0);
  } catch (err) {
    console.error("Script failed:", err.message);
    process.exit(1);
  }
};

run();