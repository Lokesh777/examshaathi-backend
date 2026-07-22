require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");
const pdfParse = require("pdf-parse");
const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");
const questionModel = require("../models/question.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const examSlug = process.argv[2];
const questionPdfUrl = process.argv[3];
const answerKeyPdfUrl = process.argv[4];
const paperYear = parseInt(process.argv[5]);

if (!examSlug || !questionPdfUrl || !answerKeyPdfUrl || !paperYear) {
  console.error(
    "Usage: node fetchPreviousPaperFull.script.js <examSlug> <questionPdfUrl> <answerKeyPdfUrl> <year>"
  );
  process.exit(1);
}


const CHUNK_SIZE = 9000; // chars per Groq call, safe margin for token limit
const CHUNK_OVERLAP = 400; // avoid cutting a question in half at chunk boundary

const legacyHttpsAgent = new https.Agent({
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

const downloadPdfText = async (url) => {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    httpsAgent: legacyHttpsAgent,
  });
  const data = await pdfParse(res.data);
  return data.text;
};

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

const extractQuestionsFromChunk = async (examName, topicListText, chunkText) => {
  const prompt = `
You are extracting REAL exam questions from a chunk of an official previous-year question
paper for "${examName}".

Below is a numbered list of valid topics for this exam:
${topicListText}

TASK:
- Extract every COMPLETE MCQ question present in this text chunk, with its original question
  number (as printed, e.g. "Q.23" or "23.").
- For each question, choose the SINGLE best-matching "topicNumber" from the list above.
- ONLY extract questions that are literally present in the text. Do not invent anything.
- If a question is cut off / incomplete at the start or end of this chunk (likely due to
  chunk boundaries), SKIP it — it may be captured fully in a neighboring chunk.
- Options must be exactly 4. Preserve option order exactly as printed (A, B, C, D).
- Translate to HINDI (Devanagari) only if source is in English; keep facts unchanged.
- All numbers must be English/Arabic numerals.

Return ONLY valid JSON, no markdown:
{
  "questions": [
    {
      "qNo": 23,
      "questionText": "...",
      "options": ["...", "...", "...", "..."],
      "topicNumber": 7
    }
  ]
}

Text chunk:
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

const extractAnswerKey = async (examName, answerKeyText) => {
  const prompt = `
Below is the text of an official ANSWER KEY for "${examName}".

Extract a mapping of question number to correct option letter (A/B/C/D).
Only include entries you are confident about — skip anything ambiguous or unreadable.

Return ONLY valid JSON, no markdown:
{
  "answers": { "1": "B", "2": "D", "3": "A" }
}

Answer key text:
"""
${answerKeyText.slice(0, 12000)}
"""
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 4096,
  });

  const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
  return JSON.parse(text).answers;
};

const letterToOptionText = (letter, options) => {
  const idx = { A: 0, B: 1, C: 2, D: 3 }[letter?.toUpperCase()];
  if (idx === undefined) return null;
  return options[idx] || null;
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
    if (topics.length === 0) {
      console.error("No topics found for this exam — run syllabus script first.");
      process.exit(1);
    }
    const topicListText = topics.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
    console.log(`Loaded ${topics.length} topics for classification`);

    console.log("Downloading question paper PDF...");
    const questionPdfText = await downloadPdfText(questionPdfUrl);
    console.log(`Question paper text length: ${questionPdfText.length}`);

    console.log("Downloading answer key PDF...");
    const answerKeyPdfText = await downloadPdfText(answerKeyPdfUrl);
    console.log(`Answer key text length: ${answerKeyPdfText.length}`);

    if (questionPdfText.trim().length < 200 || answerKeyPdfText.trim().length < 20) {
      console.warn("PDF text too short — likely a scanned/image PDF (no selectable text). Aborting.");
      process.exit(0);
    }

    // Step 1: extract all questions, chunk by chunk
    const chunks = splitIntoChunks(questionPdfText);
    console.log(`Processing question paper in ${chunks.length} chunk(s)...`);

    const allQuestions = [];
    const seenQNos = new Set();

    for (let i = 0; i < chunks.length; i++) {
      console.log(`Chunk ${i + 1}/${chunks.length}...`);
      let result;
      try {
        result = await extractQuestionsFromChunk(exam.name, topicListText, chunks[i]);
      } catch (err) {
        console.warn(`Chunk ${i + 1} failed (${err.message}), skipping.`);
        continue;
      }
      for (const q of result.questions || []) {
        if (seenQNos.has(q.qNo)) continue; // overlap zone might repeat a question
        seenQNos.add(q.qNo);
        allQuestions.push(q);
      }
    }
    console.log(`Total unique questions extracted: ${allQuestions.length}`);

    // Step 2: extract answer key
    console.log("Extracting answer key...");
    const answers = await extractAnswerKey(exam.name, answerKeyPdfText);
    console.log(`Answer key entries found: ${Object.keys(answers).length}`);

    // Step 3: merge, only keep questions with a known, valid answer
    const finalDocs = [];
    let skippedNoAnswer = 0;
    let skippedBadTopic = 0;

    for (const q of allQuestions) {
      const letter = answers[String(q.qNo)];
      const correctAnswer = letter ? letterToOptionText(letter, q.options) : null;
      if (!correctAnswer) {
        skippedNoAnswer++;
        continue;
      }

      const topic = topics[q.topicNumber - 1]; // 1-indexed list
      if (!topic) {
        skippedBadTopic++;
        continue;
      }

      finalDocs.push({
        examId: exam._id,
        topicId: topic._id,
        questionText: q.questionText,
        options: q.options,
        correctAnswer,
        explanation: `RSSB previous-year paper (${paperYear}) — ${exam.name}`,
        referenceLinks: [questionPdfUrl, answerKeyPdfUrl],
        difficulty: "moderate",
        pattern: "old",
        source: "previous-paper",
        year: paperYear,
      });
    }

    console.log(
      `Skipped (no answer found): ${skippedNoAnswer} | Skipped (bad topic index): ${skippedBadTopic}`
    );
    console.log(`Ready to insert: ${finalDocs.length} questions`);

    if (finalDocs.length === 0) {
      console.warn("Nothing usable to insert.");
      process.exit(0);
    }

    // dedupe against existing previous-paper questions across all topics of this exam
    const existing = await questionModel
      .find({ examId: exam._id, source: "previous-paper" })
      .select("questionText")
      .lean();
    const seenTexts = new Set(existing.map((d) => d.questionText.trim().toLowerCase()));

    const toInsert = finalDocs.filter((d) => {
      const key = d.questionText.trim().toLowerCase();
      if (seenTexts.has(key)) return false;
      seenTexts.add(key);
      return true;
    });

    await questionModel.insertMany(toInsert);
    console.log(`Inserted ${toInsert.length} previous-paper questions across topics.`);

    // summary by topic
    const byTopic = {};
    toInsert.forEach((d) => {
      byTopic[d.topicId] = (byTopic[d.topicId] || 0) + 1;
    });
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