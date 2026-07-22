require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const Tesseract = require("tesseract.js");
const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");
const questionModel = require("../models/question.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const POPPLER_BIN_PATH = process.env.POPPLER_BIN_PATH;

const examSlug = process.argv[2];
const questionPdfUrl = process.argv[3];
const answerKeyPdfUrl = process.argv[4];
const paperYear = parseInt(process.argv[5]);

if (!examSlug || !questionPdfUrl || !answerKeyPdfUrl || !paperYear) {
  console.error(
    "Usage: node fetchPreviousPaperOCR.script.js <examSlug> <questionPdfUrl> <answerKeyPdfUrl> <year>"
  );
  process.exit(1);
}

if (!POPPLER_BIN_PATH || !fs.existsSync(path.join(POPPLER_BIN_PATH, "pdftoppm.exe"))) {
  console.error(
    `POPPLER_BIN_PATH not set correctly, or pdftoppm.exe not found at: ${POPPLER_BIN_PATH}`
  );
  process.exit(1);
}

const legacyHttpsAgent = new https.Agent({
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

const CHUNK_SIZE = 9000;
const CHUNK_OVERLAP = 400;

const downloadPdfBuffer = async (url) => {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    httpsAgent: legacyHttpsAgent,
  });
  return Buffer.from(res.data);
};

// PDF -> PNG pages, using Poppler CLI (no native npm build needed)
const pdfBufferToImagePaths = (pdfBuffer, label) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pdfocr-${label}-`));
  const pdfPath = path.join(tempDir, "input.pdf");
  fs.writeFileSync(pdfPath, pdfBuffer);

  const outputPrefix = path.join(tempDir, "page");
  const pdftoppmPath = path.join(POPPLER_BIN_PATH, "pdftoppm.exe");

  execFileSync(pdftoppmPath, ["-png", "-r", "200", pdfPath, outputPrefix]);

  const files = fs
    .readdirSync(tempDir)
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => {
      const numA = parseInt(a.match(/-(\d+)\.png$/)?.[1] || "0");
      const numB = parseInt(b.match(/-(\d+)\.png$/)?.[1] || "0");
      return numA - numB;
    });

  return files.map((f) => path.join(tempDir, f));
};

const ocrPdf = async (pdfBuffer, label) => {
  console.log(`[${label}] Converting PDF pages to images via Poppler...`);
  const imagePaths = pdfBufferToImagePaths(pdfBuffer, label);
  console.log(`[${label}] ${imagePaths.length} page(s) to OCR`);

  // create ONE worker, reuse across all pages — this is the fix
  const worker = await Tesseract.createWorker("hin+eng");

  let fullText = "";
  try {
    for (let i = 0; i < imagePaths.length; i++) {
      console.log(`[${label}] OCR on page ${i + 1}/${imagePaths.length}...`);
      const result = await worker.recognize(imagePaths[i]);
      fullText += "\n\n" + result.data.text;

      // cleanup the page image right after use — don't let 32 PNGs
      // pile up in the temp dir / memory references
      fs.unlinkSync(imagePaths[i]);
    }
  } finally {
    await worker.terminate(); // always release, even if a page throws
  }

  return fullText;
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
You are extracting REAL exam questions from OCR'd text of an official previous-year question
paper for "${examName}". The text may contain OCR errors (misspelled words, garbled characters,
merged lines) — use your judgment to reconstruct the intended question where reasonably clear,
but SKIP anything too garbled to confidently reconstruct.

Below is a numbered list of valid topics for this exam:
${topicListText}

TASK:
- Extract every COMPLETE MCQ question you can confidently read, with its original question
  number (e.g. "Q.23" or "23.").
- For each question, choose the SINGLE best-matching "topicNumber" from the list above.
- Do not invent facts not present in the text — only fix obvious OCR typos, don't guess content.
- Options must be exactly 4. Preserve option order (A, B, C, D).
- Translate to HINDI (Devanagari) if source is in English; keep facts unchanged.
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

OCR text chunk:
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
Below is text (possibly OCR'd) of an official ANSWER KEY for "${examName}".

Extract a mapping of question number to correct option letter (A/B/C/D).
Only include entries you are confident about — skip anything ambiguous or unreadable.

Return ONLY valid JSON, no markdown:
{ "answers": { "1": "B", "2": "D" } }

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
    const topicListText = topics.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
    console.log(`Loaded ${topics.length} topics for classification`);

    const questionPdfBuffer = await downloadPdfBuffer(questionPdfUrl);
    const answerKeyPdfBuffer = await downloadPdfBuffer(answerKeyPdfUrl);

    const questionText = await ocrPdf(questionPdfBuffer, "QuestionPaper");
    console.log(`OCR question paper text length: ${questionText.length}`);

    const answerKeyText = await ocrPdf(answerKeyPdfBuffer, "AnswerKey");
    console.log(`OCR answer key text length: ${answerKeyText.length}`);

    if (questionText.trim().length < 200) {
      console.warn("OCR produced very little text — image quality may be too poor. Aborting.");
      process.exit(0);
    }

    const chunks = splitIntoChunks(questionText);
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
        if (seenQNos.has(q.qNo)) continue;
        seenQNos.add(q.qNo);
        allQuestions.push(q);
      }
    }
    console.log(`Total unique questions extracted: ${allQuestions.length}`);

    console.log("Extracting answer key...");
    const answers = await extractAnswerKey(exam.name, answerKeyText);
    console.log(`Answer key entries found: ${Object.keys(answers).length}`);

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
      const topic = topics[q.topicNumber - 1];
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
        explanation: `RSSB previous-year paper (${paperYear}) — ${exam.name}. Note: extracted via OCR, please verify.`,
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

    const existing = await questionModel
      .find({ examId: exam._id, source: "previous-paper", year: paperYear })
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