const mongoose = require("mongoose");
const Groq = require("groq-sdk");
const chatMessageModel = require("../models/chatMessage.model");
const topicModel = require("../models/topic.model");
const examModel = require("../models/exam.model");
const questionModel = require("../models/question.model");
const { getEmbedding } = require("./embedding.service");
const { resolveTopicLanguage } = require("./ai/newPatternPrompts");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SIMILARITY_THRESHOLD = 0.92;

const detectStudentLanguage = (text) => {
  const t = String(text || "");
  const hasDeva = /[\u0900-\u097F]/.test(t);
  const hasLatin = /[a-zA-Z]{3,}/.test(t);
  if (hasDeva && !hasLatin) return "hindi";
  if (hasLatin && !hasDeva) return "english";
  if (hasDeva && hasLatin) return "hinglish";
  return "auto";
};

const languageInstructions = (topicLang, studentLang) => {
  if (topicLang === "english") {
    return `- This is an ENGLISH syllabus topic. Write the entire answer in clear ENGLISH only (no Devanagari).
- Keep exam terminology precise (grammar terms, etc.).`;
  }

  if (studentLang === "english") {
    return `- Student asked in English. Answer in clear ENGLISH.
- You may mention the standard Hindi term in parentheses once if it helps exam prep.`;
  }

  if (studentLang === "hinglish") {
    return `- Student used Hinglish. Reply in natural Hinglish (simple Hindi + English exam terms), easy to revise.`;
  }

  return `- This is a Hindi-medium exam topic. Reply in HINDI (Devanagari script).
- Use Arabic numerals (1576, not १५७६).
- Keep the answer exam-ready and precise.`;
};

const loadTopicGrounding = async (topicId) => {
  const docs = await questionModel
    .find({ topicId })
    .select("questionText explanation questionType source")
    .sort({ updatedAt: -1 })
    .limit(8)
    .lean();

  const preferred = [...docs].sort((a, b) => {
    const rank = (d) =>
      (d.source === "previous-paper" ? 3 : 0) +
      (d.source === "admin" ? 2 : 0) +
      (d.explanation?.length > 40 ? 1 : 0);
    return rank(b) - rank(a);
  });

  return preferred.slice(0, 4).map((d, i) => {
    const expl = d.explanation ? ` → ${String(d.explanation).slice(0, 180)}` : "";
    return `${i + 1}. ${String(d.questionText || "").slice(0, 220)}${expl}`;
  });
};

const SYSTEM_PROMPT = `You are ExamSaathi AI Tutor — a sharp, friendly coach for Rajasthan government exams (CET / RSSB / REET style).
Give accurate, exam-oriented answers. Prefer standard textbook / syllabus facts.
Never invent fake schemes, fake years, or fake court cases.
Never invent or list web source URLs.
Keep answers concise unless the student explicitly asks for detail.`;

const askQuestion = async (userId, examId, topicId, userQuestion) => {
  const topic = await topicModel.findById(topicId);
  const exam = await examModel.findById(examId);
  if (!topic || !exam) throw new Error("Exam or topic not found");

  await chatMessageModel.create({
    userId,
    examId,
    topicId,
    role: "user",
    content: userQuestion,
  });

  let bestMatch = null;
  try {
    const queryEmbedding = await getEmbedding(userQuestion);
    const matches = await chatMessageModel.aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: 50,
          limit: 3,
          filter: {
            topicId: new mongoose.Types.ObjectId(topicId),
            role: "assistant",
          },
        },
      },
      {
        $project: {
          content: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);
    bestMatch = matches[0] || null;
  } catch (err) {
    console.warn("Chat vector search skipped:", err.message);
  }

  // Do not return broken weightage / reference URLs as "sources"
  const sources = [];

  if (bestMatch && bestMatch.score >= SIMILARITY_THRESHOLD) {
    await chatMessageModel.create({
      userId,
      examId,
      topicId,
      role: "assistant",
      content: bestMatch.content,
    });
    return { answer: bestMatch.content, cached: true, sources };
  }

  const topicLang = resolveTopicLanguage(topic);
  const studentLang = detectStudentLanguage(userQuestion);
  const grounding = await loadTopicGrounding(topicId);
  const recent = await chatMessageModel
    .find({ userId, topicId })
    .sort({ createdAt: -1 })
    .limit(8)
    .select("role content")
    .lean();
  // Drop the user message we just saved — it is passed separately below
  const prior = recent.slice(1).reverse();
  const historyBlock = prior
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${String(m.content).slice(0, 280)}`)
    .join("\n");

  const prompt = `Exam: ${exam.name}
Topic: ${topic.name}${topic.patternSection ? ` (section: ${topic.patternSection})` : ""}
Topic content language preference: ${topicLang.toUpperCase()}

${languageInstructions(topicLang, studentLang)}

Answer style:
- Start with a SHORT direct answer (1–2 sentences).
- Then add a brief explanation (2–4 sentences) with exam-useful detail (definition, trick, example, or common trap).
- Use short bullets only when listing steps/points.
- Do NOT dump long essays.
- Do NOT add "Sources", links, or citations.

${
  grounding.length
    ? `Syllabus grounding from this topic's question bank (style/facts only — do not copy verbatim):\n${grounding.join("\n")}\n`
    : ""
}
${historyBlock ? `Recent chat:\n${historyBlock}\n` : ""}
Student's question:
"""
${userQuestion}
"""`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.35,
    max_tokens: 700,
  });

  const answer = completion.choices[0].message.content.trim();

  let answerEmbedding = null;
  try {
    answerEmbedding = await getEmbedding(answer);
  } catch {
    /* embedding optional */
  }

  await chatMessageModel.create({
    userId,
    examId,
    topicId,
    role: "assistant",
    content: answer,
    ...(answerEmbedding ? { embedding: answerEmbedding } : {}),
  });

  return { answer, cached: false, sources };
};

const getChatHistory = async (userId, topicId) => {
  return chatMessageModel
    .find({ userId, topicId })
    .sort({ createdAt: 1 })
    .select("role content createdAt");
};

module.exports = { askQuestion, getChatHistory };
