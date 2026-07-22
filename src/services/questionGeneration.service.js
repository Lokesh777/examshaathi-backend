// const Groq = require("groq-sdk");
// const questionModel = require("../models/question.model");

// const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// const BATCH_SIZE = 10;
// const MAX_ATTEMPTS = 15;
// const VALID_DIFFICULTIES = ["easy", "moderate", "hard"];

// const sanitizeDifficulty = (value) => {
//   const normalized = (value || "").toLowerCase().trim();
//   if (VALID_DIFFICULTIES.includes(normalized)) return normalized;
//   if (normalized.includes("hard")) return "hard";
//   if (normalized.includes("easy")) return "easy";
//   return "moderate";
// };

// const generateQuestionsWithGroq = async (examName, topicName, count, existingTexts) => {
//   const avoidList = existingTexts.slice(-40);
//   const avoidListText =
//     avoidList.length > 0
//       ? `\n\nDO NOT generate questions with the same meaning as any of these (even if worded differently):\n` +
//         avoidList.map((t, i) => `${i + 1}. ${t}`).join("\n")
//       : "";

//   const prompt = `
// You are an expert exam-question setter for "${examName}", specifically for the topic
// "${topicName}" (this topic name is in Hindi).

// Generate EXACTLY ${count} multiple-choice questions (MCQs) for this topic, at a difficulty
// mix suitable for a competitive government exam.

// STRICT RULES:
// - questionText, all 4 options, and explanation must ALL be in HINDI (Devanagari script).
// - ALL NUMBERS must be English/Arabic numerals (1576, not १५७६).
// - Each question must have exactly 4 options.
// - correctAnswer must exactly match one of the 4 options (same string).
// - explanation is MANDATORY for every single question.
// - difficulty must be EXACTLY one of these three values: "easy", "moderate", "hard" — no other
//   values like "extremely hard" or "medium" are allowed.
// - Do not repeat the same question twice within this batch.
// - Do not generate questions that mean the same thing as an existing question.
// - Keep explanation short (1-2 lines).
// - Output must be COMPLETE valid JSON — do not truncate.
// ${avoidListText}

// Return ONLY valid JSON, no markdown:
// {
//   "questions": [
//     {
//       "questionText": "...",
//       "options": ["...","...","...","..."],
//       "correctAnswer": "...",
//       "explanation": "...",
//       "difficulty": "easy"
//     }
//   ]
// }
// `;

//   const completion = await groq.chat.completions.create({
//     model: "llama-3.3-70b-versatile",
//     messages: [{ role: "user", content: prompt }],
//     temperature: 0.5,
//     max_tokens: 4096,
//   });

//   const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
//   const jsonMatch = text.match(/\{[\s\S]*\}/);
//   return JSON.parse(jsonMatch ? jsonMatch[0] : text);
// };

// const generateQuestionsForTopic = async (topic, exam, requestedCount) => {
//   const existingDocs = await questionModel
//     .find({ topicId: topic._id })
//     .select("questionText")
//     .lean();
//   const seenTexts = new Set(existingDocs.map((d) => d.questionText.trim().toLowerCase()));
//   let currentTotal = existingDocs.length;

//   if (currentTotal >= requestedCount) {
//     return { inserted: 0, finalCount: currentTotal, skipped: true };
//   }

//   let totalInserted = 0;
//   let attempts = 0;

//   while (currentTotal < requestedCount && attempts < MAX_ATTEMPTS) {
//     attempts++;
//     const remaining = requestedCount - currentTotal;
//     const thisBatchSize = Math.min(BATCH_SIZE, remaining);

//     let structured;
//     try {
//       structured = await generateQuestionsWithGroq(
//         exam.name,
//         topic.name,
//         thisBatchSize,
//         Array.from(seenTexts)
//       );
//     } catch (err) {
//       try {
//         structured = await generateQuestionsWithGroq(
//           exam.name,
//           topic.name,
//           thisBatchSize,
//           Array.from(seenTexts)
//         );
//       } catch (err2) {
//         console.warn(`  Batch failed twice, skipping: ${err2.message}`);
//         continue;
//       }
//     }

//     const validQuestions = (structured.questions || []).filter(
//       (q) => q.explanation && q.explanation.trim().length > 0
//     );

//     const freshQuestions = [];
//     for (const q of validQuestions) {
//       const key = q.questionText.trim().toLowerCase();
//       if (seenTexts.has(key)) continue;
//       seenTexts.add(key);
//       freshQuestions.push(q);
//     }

//     const questionDocs = freshQuestions.map((q) => ({
//       examId: exam._id,
//       topicId: topic._id,
//       questionText: q.questionText,
//       options: q.options,
//       correctAnswer: q.correctAnswer,
//       explanation: q.explanation,
//       referenceLinks: topic.weightageSourceLinks || [],
//       difficulty: sanitizeDifficulty(q.difficulty),
//       pattern: "new",
//       source: "ai",
//     }));

//     if (questionDocs.length > 0) {
//       try {
//         await questionModel.insertMany(questionDocs, { ordered: false });
//         // ordered: false — if ONE doc has a leftover validation issue, others still insert
//         totalInserted += questionDocs.length;
//         currentTotal += questionDocs.length;
//       } catch (err) {
//         console.warn(`  Some docs in this batch failed to insert: ${err.message}`);
//         // count what did succeed, if driver reports it
//         if (err.insertedDocs) {
//           totalInserted += err.insertedDocs.length;
//           currentTotal += err.insertedDocs.length;
//         }
//       }
//     }
//   }

//   return { inserted: totalInserted, finalCount: currentTotal, skipped: false };
// };

// module.exports = { generateQuestionsForTopic };


const Groq = require("groq-sdk");
const questionModel = require("../models/question.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 15;
const REQUEST_TIMEOUT_MS = 30000; // 30 sec — if Groq doesn't respond by then, fail and retry
const VALID_DIFFICULTIES = ["easy", "moderate", "hard"];

const sanitizeDifficulty = (value) => {
  const normalized = (value || "").toLowerCase().trim();
  if (VALID_DIFFICULTIES.includes(normalized)) return normalized;
  if (normalized.includes("hard")) return "hard";
  if (normalized.includes("easy")) return "easy";
  return "moderate";
};

// wraps any promise with a hard timeout so nothing can hang forever
const withTimeout = (promise, ms, label) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
    ),
  ]);
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
mix suitable for a competitive government exam.

STRICT RULES:
- questionText, all 4 options, and explanation must ALL be in HINDI (Devanagari script).
- ALL NUMBERS must be English/Arabic numerals (1576, not १५७६).
- Each question must have exactly 4 options.
- correctAnswer must exactly match one of the 4 options (same string).
- explanation is MANDATORY for every single question.
- difficulty must be EXACTLY one of these three values: "easy", "moderate", "hard".
- Do not repeat the same question twice within this batch.
- Do not generate questions that mean the same thing as an existing question.
- Keep explanation short (1-2 lines).
- Output must be COMPLETE valid JSON — do not truncate.
${avoidListText}

Return ONLY valid JSON, no markdown:
{
  "questions": [
    { "questionText": "...", "options": ["...","...","...","..."], "correctAnswer": "...", "explanation": "...", "difficulty": "easy" }
  ]
}
`;

  const completion = await withTimeout(
    groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 4096,
    }),
    REQUEST_TIMEOUT_MS,
    `Groq call for topic "${topicName}"`
  );

  const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
};

const generateQuestionsForTopic = async (topic, exam, requestedCount) => {
  const existingDocs = await questionModel
    .find({ topicId: topic._id })
    .select("questionText")
    .lean();
  const seenTexts = new Set(existingDocs.map((d) => d.questionText.trim().toLowerCase()));
  let currentTotal = existingDocs.length;

  if (currentTotal >= requestedCount) {
    return { inserted: 0, finalCount: currentTotal, skipped: true };
  }

  let totalInserted = 0;
  let attempts = 0;

  while (currentTotal < requestedCount && attempts < MAX_ATTEMPTS) {
    attempts++;
    const remaining = requestedCount - currentTotal;
    const thisBatchSize = Math.min(BATCH_SIZE, remaining);

    console.log(`    batch attempt ${attempts}: requesting ${thisBatchSize} (have ${currentTotal}/${requestedCount})...`);

    let structured;
    try {
      structured = await generateQuestionsWithGroq(
        exam.name,
        topic.name,
        thisBatchSize,
        Array.from(seenTexts)
      );
    } catch (err) {
      console.warn(`    attempt ${attempts} failed: ${err.message}, retrying once...`);
      try {
        structured = await generateQuestionsWithGroq(
          exam.name,
          topic.name,
          thisBatchSize,
          Array.from(seenTexts)
        );
      } catch (err2) {
        console.warn(`    retry also failed: ${err2.message}, skipping this attempt`);
        continue;
      }
    }

    const validQuestions = (structured.questions || []).filter(
      (q) => q.explanation && q.explanation.trim().length > 0
    );

    const freshQuestions = [];
    for (const q of validQuestions) {
      const key = q.questionText.trim().toLowerCase();
      if (seenTexts.has(key)) continue;
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
      referenceLinks: topic.weightageSourceLinks || [],
      difficulty: sanitizeDifficulty(q.difficulty),
      pattern: "new",
      source: "ai",
    }));

    if (questionDocs.length > 0) {
      try {
        await questionModel.insertMany(questionDocs, { ordered: false });
        totalInserted += questionDocs.length;
        currentTotal += questionDocs.length;
        console.log(`    inserted ${questionDocs.length}, running total: ${currentTotal}`);
      } catch (err) {
        console.warn(`    insert error: ${err.message}`);
      }
    }
  }

  return { inserted: totalInserted, finalCount: currentTotal, skipped: false };
};

module.exports = { generateQuestionsForTopic };