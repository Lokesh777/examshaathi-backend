const mongoose = require("mongoose");
const Groq = require("groq-sdk");
const chatMessageModel = require("../models/chatMessage.model");
const topicModel = require("../models/topic.model");
const examModel = require("../models/exam.model");
const questionModel = require("../models/question.model");
const { getEmbedding } = require("./embedding.service");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SIMILARITY_THRESHOLD = 0.88;

// reuse existing referenceLinks from the Question bank for this topic —
// no extra Tavily call needed, this data already exists from generation time
const getSuggestedSources = async (topicId) => {
  const doc = await questionModel
    .findOne({ topicId, referenceLinks: { $exists: true, $ne: [] } })
    .select("referenceLinks")
    .lean();
  return doc?.referenceLinks || [];
};

const askQuestion = async (userId, examId, topicId, userQuestion) => {
  const topic = await topicModel.findById(topicId);
  const exam = await examModel.findById(examId);

  await chatMessageModel.create({
    userId,
    examId,
    topicId,
    role: "user",
    content: userQuestion,
  });

  const queryEmbedding = await getEmbedding(userQuestion);

  const matches = await chatMessageModel.aggregate([
    {
      $vectorSearch: {
        index: "vector_index",
        path: "embedding",
        queryVector: queryEmbedding,
        numCandidates: 50,
        limit: 3,
        filter: { topicId: new mongoose.Types.ObjectId(topicId) },
      },
    },
    {
      $project: {
        content: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]);
console.log("DEBUG — matches found:", matches.length);
console.log("DEBUG — top match score:", matches[0]?.score);

  const bestMatch = matches[0];
  const sources = await getSuggestedSources(topicId);

  if (bestMatch && bestMatch.score >= SIMILARITY_THRESHOLD) {
    console.log(`Cache hit (score: ${bestMatch.score})`);
    return { answer: bestMatch.content, cached: true, sources };
  }

  const prompt = `
You are a helpful exam-prep tutor for "${exam.name}", topic "${topic.name}" (Hindi topic name).

Answer the student's question. Rules:
- Give a SHORT, EXACT answer first (1-2 sentences) — the direct fact/answer, not a lecture.
- Only add a brief supporting explanation (1-2 more sentences) if it genuinely helps the
  student remember or understand — skip it if the answer is self-explanatory.
- Do NOT write long essays or multiple paragraphs. Competitive-exam students want fast,
  precise answers.
- Respond in the SAME language/script the student used (Hindi/English/Hinglish — match it).

Student's question:
"""
${userQuestion}
"""
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 300, // capped — enforces short answers, also saves cost
  });

  const answer = completion.choices[0].message.content.trim();

  const answerEmbedding = await getEmbedding(answer);

  await chatMessageModel.create({
    userId,
    examId,
    topicId,
    role: "assistant",
    content: answer,
    embedding: answerEmbedding,
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