const mongoose = require("mongoose");
const questionModel = require("../models/question.model");
const quizModel = require("../models/quiz.model");
const attemptModel = require("../models/attempt.model");
const topicModel = require("../models/topic.model");
const examModel = require("../models/exam.model");
const { fingerprintQuestionText } = require("../utils/questionDedupe");
const { estimateDurationMinutes } = require("../utils/quizTiming");

const QUESTION_QUIZ_FIELDS =
  "questionText options difficulty topicId questionMedia optionMedia answerMode questionType";

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(String(id));
};

const shuffleInPlace = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/** Unique-by-text sample so quizzes never repeat near-duplicate bank items. */
const sampleUniqueQuestionIds = async (topicOid, sampleSize) => {
  const pool = await questionModel
    .find({ topicId: topicOid })
    .select("_id questionText")
    .lean();

  shuffleInPlace(pool);
  const picked = [];
  const seen = new Set();
  for (const q of pool) {
    const fp = fingerprintQuestionText(q.questionText);
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    picked.push(q._id);
    if (picked.length >= sampleSize) break;
  }
  return picked;
};

/** Create a new frozen topic practice quiz for this user. */
const createTopicPracticeQuiz = async (examId, topicId, userId, count = 20) => {
  const topicOid = toObjectId(topicId);
  const available = await questionModel.countDocuments({ topicId: topicOid });
  if (available === 0) {
    throw new Error("No questions in this topic bank yet. Generate some first.");
  }

  const sampleSize = Math.min(Math.max(Number(count) || 20, 1), available);
  const questionIds = await sampleUniqueQuestionIds(topicOid, sampleSize);
  if (questionIds.length === 0) {
    throw new Error("No unique questions available for this topic.");
  }

  const topic = await topicModel.findById(topicOid).select("name").lean();
  const exam = await examModel.findById(examId).select("pattern").lean();
  const existingCount = await quizModel.countDocuments({
    examId,
    topicId: topicOid,
    type: "topic-wise",
    createdBy: userId,
  });
  const title = `${topic?.name || "Topic"} · Practice ${existingCount + 1}`;
  const durationMinutes = estimateDurationMinutes(questionIds.length, exam);

  const quiz = await quizModel.create({
    examId,
    topicId: topicOid,
    type: "topic-wise",
    title,
    questions: questionIds,
    durationMinutes,
    pullRule: { topicId: topicOid, count: questionIds.length },
    createdBy: userId,
  });

  const docs = await questionModel
    .find({ _id: { $in: quiz.questions } })
    .select(QUESTION_QUIZ_FIELDS);
  const map = new Map(docs.map((q) => [String(q._id), q]));
  const questions = quiz.questions.map((id) => map.get(String(id))).filter(Boolean);

  return { quiz, questions };
};

/** List this user's topic practice quizzes (newest first). Admin sees all for topic. */
const listTopicPracticeQuizzes = async (examId, topicId, userId, isAdmin = false) => {
  const topicOid = toObjectId(topicId);
  const filter = {
    examId,
    topicId: topicOid,
    type: "topic-wise",
    questions: { $exists: true, $ne: [] },
  };
  if (!isAdmin) {
    filter.createdBy = userId;
  }

  const quizzes = await quizModel
    .find(filter)
    .sort({ createdAt: -1 })
    .lean();

  const quizIds = quizzes.map((q) => q._id);
  const attempts = await attemptModel
    .find({ quizId: { $in: quizIds }, userId })
    .sort({ submittedAt: -1 })
    .lean();

  const latestAttemptByQuiz = new Map();
  const attemptCountByQuiz = new Map();
  for (const a of attempts) {
    const key = String(a.quizId);
    attemptCountByQuiz.set(key, (attemptCountByQuiz.get(key) || 0) + 1);
    if (!latestAttemptByQuiz.has(key)) latestAttemptByQuiz.set(key, a);
  }

  return quizzes.map((q) => {
    const key = String(q._id);
    const attempt = latestAttemptByQuiz.get(key);
    const attemptCount = attemptCountByQuiz.get(key) || 0;
    const isOwner = q.createdBy && String(q.createdBy) === String(userId);
    return {
      quizId: q._id,
      title: q.title,
      totalQuestions: q.questions?.length || 0,
      createdAt: q.createdAt,
      createdBy: q.createdBy || null,
      isOwner: !!isOwner,
      canDelete: isAdmin || !!isOwner,
      attempted: attemptCount > 0,
      attempts: attemptCount,
      lastScore: attempt?.score ?? null,
      lastScorePercent: attempt?.scorePercent ?? null,
      lastAttemptId: attempt?._id ?? null,
    };
  });
};

/** Delete a topic/mock quiz. Owner or admin. Removes attempts. */
const deleteQuizForUser = async (quizId, userId, isAdmin = false) => {
  const quiz = await quizModel.findById(quizId);
  if (!quiz) throw new Error("Quiz not found");

  const isOwner = quiz.createdBy && String(quiz.createdBy) === String(userId);
  if (!isAdmin && !isOwner) {
    throw new Error("Not allowed to delete this quiz");
  }

  await attemptModel.deleteMany({ quizId: quiz._id });
  await quizModel.deleteOne({ _id: quiz._id });
  return { deleted: true, quizId: quiz._id };
};

/** List bank questions for a topic (admin: all; user: own generated). */
const listTopicBankQuestions = async (examId, topicId, userId, isAdmin = false) => {
  const topicOid = toObjectId(topicId);
  const filter = { examId, topicId: topicOid };
  if (!isAdmin) {
    filter.createdBy = userId;
  }

  const docs = await questionModel
    .find(filter)
    .select("questionText questionType source pattern difficulty createdBy createdAt")
    .sort({ createdAt: -1 })
    .limit(isAdmin ? 100 : 50)
    .lean();

  return docs.map((q) => ({
    _id: q._id,
    questionText: q.questionText,
    questionType: q.questionType,
    source: q.source,
    pattern: q.pattern,
    difficulty: q.difficulty,
    createdBy: q.createdBy || null,
    createdAt: q.createdAt,
    isOwner: q.createdBy && String(q.createdBy) === String(userId),
  }));
};

/** Delete a bank question. Creator or admin. Pulls id from frozen quizzes. */
const deleteQuestionForUser = async (questionId, userId, isAdmin = false) => {
  const question = await questionModel.findById(questionId);
  if (!question) throw new Error("Question not found");

  const isOwner = question.createdBy && String(question.createdBy) === String(userId);
  if (!isAdmin && !isOwner) {
    throw new Error("Not allowed to delete this question");
  }

  await quizModel.updateMany(
    { questions: question._id },
    { $pull: { questions: question._id } }
  );
  await questionModel.deleteOne({ _id: question._id });
  return { deleted: true, questionId: question._id };
};

/**
 * Legacy helper: sample from bank without freezing.
 * Prefer createTopicPracticeQuiz for user-facing practice.
 */
const getOrCreateTopicQuiz = async (examId, topicId, count = 20) => {
  const topicOid = toObjectId(topicId);
  const available = await questionModel.countDocuments({ topicId: topicOid });
  if (available < count) {
    console.warn(`Bank has only ${available}/${count} for topic ${topicId}`);
  }

  let quiz = await quizModel.findOne({
    examId,
    topicId: topicOid,
    type: "topic-wise",
    createdBy: null,
  });
  if (!quiz) {
    quiz = await quizModel.create({
      examId,
      topicId: topicOid,
      type: "topic-wise",
      title: "Topic Practice",
      pullRule: { topicId: topicOid, count },
    });
  }

  const questions = await questionModel.aggregate([
    { $match: { topicId: topicOid } },
    { $sample: { size: Math.min(count, Math.max(available, 0)) || count } },
    {
      $project: {
        questionText: 1,
        options: 1,
        difficulty: 1,
        questionMedia: 1,
        optionMedia: 1,
        answerMode: 1,
        questionType: 1,
      },
    },
  ]);

  return { quiz, questions };
};

module.exports = {
  createTopicPracticeQuiz,
  listTopicPracticeQuizzes,
  getOrCreateTopicQuiz,
  sampleUniqueQuestionIds,
  deleteQuizForUser,
  listTopicBankQuestions,
  deleteQuestionForUser,
};
