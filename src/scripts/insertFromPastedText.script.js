// Tum ek .txt file me question+answer paste karo (dono saath, jaise coaching site se copy kiya),
// path do — AI sirf structure karega, invent nahi.

// Script B: Tum text paste kar dete ho (question + answer already saath me), AI sirf structure/format karke DB me daal deta hai — content generate nahi karta, sirf tumhara diya hua text JSON me convert karta hai
// run the script by this 
// node src/scripts/insertFromPastedText.script.js cet-12th "D:\papers\paste.txt" 2024

require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");
const questionModel = require("../models/question.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const examSlug = process.argv[2];
const textFilePath = process.argv[3];
const paperYear = parseInt(process.argv[4]);

if (!examSlug || !textFilePath || !paperYear) {
  console.error("Usage: node insertFromPastedText.script.js <examSlug> <textFilePath> <year>");
  process.exit(1);
}
if (!fs.existsSync(textFilePath)) {
  console.error(`Text file not found at: ${textFilePath}`);
  process.exit(1);
}

const CHUNK_SIZE = 9000;
const CHUNK_OVERLAP = 400;

const splitIntoChunks = (text) => {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
};

// pasted text already has Q + A together — no separate answer-key merge needed
const extractQAFromChunk = async (examName, topicListText, chunkText) => {
  const prompt = `
You are structuring REAL exam questions that were manually pasted by the user for "${examName}".
This text already contains both the question AND its correct answer together.

Valid topics for this exam:
${topicListText}

TASK:
- Extract every question present, with its 4 options and the correct answer, exactly as
  given in the text below.
- DO NOT invent, guess, or add anything not present in the text.
- If the correct answer is not clearly indicated for a question, SKIP that question entirely
  — never guess.
- For each question, choose the SINGLE best-matching "topicNumber" from the list above.
- If explanation text is present, include it (short, 1-2 lines). If not present, leave it empty.
- Translate to HINDI (Devanagari) if source is in English; keep facts unchanged.
- All numbers must be English/Arabic numerals.

Return ONLY valid JSON, no markdown:
{
  "questions": [
    {
      "questionText": "...",
      "options": ["...","...","...","..."],
      "correctAnswer": "...",
      "explanation": "...",
      "topicNumber": 7
    }
  ]
}

Pasted text:
"""
${chunkText}
"""
`;
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 4096,
  });
  const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
  return JSON.parse(text);
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("DB connected");

    const exam = await examModel.findOne({ slug: examSlug });
    if (!exam) {
      console.error(`No exam found: ${examSlug}`);
      process.exit(1);
    }

    const topics = await topicModel.find({ examId: exam._id }).sort({ order: 1 });
    const topicListText = topics.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
    console.log(`Loaded ${topics.length} topics`);

    const rawText = fs.readFileSync(textFilePath, "utf-8");
    console.log(`Pasted text length: ${rawText.length}`);

    if (rawText.trim().length < 20) {
      console.warn("Text file is empty or too short. Aborting.");
      process.exit(0);
    }

    const chunks = splitIntoChunks(rawText);
    console.log(`Processing in ${chunks.length} chunk(s)...`);

    const allExtracted = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`Chunk ${i + 1}/${chunks.length}...`);
      let result;
      try {
        result = await extractQAFromChunk(exam.name, topicListText, chunks[i]);
      } catch (err) {
        console.warn(`Chunk ${i + 1} failed: ${err.message}`);
        continue;
      }
      allExtracted.push(...(result.questions || []));
    }
    console.log(`Total extracted: ${allExtracted.length}`);

    const existing = await questionModel
      .find({ examId: exam._id, source: "previous-paper", year: paperYear })
      .select("questionText")
      .lean();
    const seenTexts = new Set(existing.map((d) => d.questionText.trim().toLowerCase()));

    const finalDocs = [];
    let skippedNoAnswer = 0;
    let skippedBadTopic = 0;
    let skippedDuplicate = 0;

    for (const q of allExtracted) {
      if (!q.correctAnswer || !q.questionText) {
        skippedNoAnswer++;
        continue;
      }
      const topic = topics[q.topicNumber - 1];
      if (!topic) {
        skippedBadTopic++;
        continue;
      }
      const key = q.questionText.trim().toLowerCase();
      if (seenTexts.has(key)) {
        skippedDuplicate++;
        continue;
      }
      seenTexts.add(key);

      finalDocs.push({
        examId: exam._id,
        topicId: topic._id,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation?.trim()
          ? q.explanation
          : `RSSB previous-year paper (${paperYear}) — ${exam.name}.`,
        referenceLinks: [],
        difficulty: "moderate",
        pattern: "old",
        source: "previous-paper",
        year: paperYear,
      });
    }

    console.log(
      `Skipped (no answer): ${skippedNoAnswer} | Skipped (bad topic): ${skippedBadTopic} | Skipped (duplicate): ${skippedDuplicate}`
    );
    console.log(`Ready to insert: ${finalDocs.length}`);

    if (finalDocs.length === 0) {
      console.warn("Nothing usable to insert.");
      process.exit(0);
    }

    await questionModel.insertMany(finalDocs);
    console.log(`Inserted ${finalDocs.length} previous-paper questions.`);

    const byTopic = {};
    finalDocs.forEach((d) => (byTopic[d.topicId] = (byTopic[d.topicId] || 0) + 1));
    console.log("\n--- Distribution by topic ---");
    for (const t of topics) {
      const count = byTopic[t._id] || 0;
      if (count > 0) console.log(`${t.name}: ${count}`);
    }

    process.exit(0);
  } catch (err) {
    console.error("Script failed:", err.message);
    process.exit(1);
  }
};

run();