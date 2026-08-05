const questionModel = require("../models/question.model");
const quizModel = require("../models/quiz.model");
const attemptModel = require("../models/attempt.model");
const examModel = require("../models/exam.model");
const userExamStreakModel = require("../models/userExamStreak.model");
const { estimateDurationMinutes } = require("../utils/quizTiming");

const DAILY_COUNT = 20;
const READINESS_TARGET = 5;

/** Today's date string in Asia/Kolkata. */
const todayIst = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
};

const yesterdayIst = () => {
  const now = new Date();
  // Subtract ~24h then format in IST — good enough for consecutive calendar days
  const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(y);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
};

const getOrCreateStreakDoc = async (userId, examId) => {
  let doc = await userExamStreakModel.findOne({ userId, examId });
  if (!doc) {
    doc = await userExamStreakModel.create({ userId, examId });
  }
  return doc;
};

/**
 * Get or create today's daily 20-Q mix across all topics for this exam.
 */
const getOrCreateDailyChallenge = async (examId, userId) => {
  const exam = await examModel.findById(examId);
  if (!exam) throw new Error("Exam not found");

  const day = todayIst();
  const title = `Daily Challenge · ${day}`;

  let quiz = await quizModel.findOne({
    examId,
    type: "daily-challenge",
    createdBy: userId,
    title,
  });

  if (!quiz) {
    const available = await questionModel.countDocuments({ examId });
    if (available === 0) {
      throw new Error("No questions in the bank yet. Generate some topic questions first.");
    }
    const sampleSize = Math.min(DAILY_COUNT, available);
    const sampled = await questionModel.aggregate([
      { $match: { examId: exam._id } },
      { $sample: { size: sampleSize } },
      { $project: { _id: 1 } },
    ]);

    const durationMinutes = estimateDurationMinutes(sampled.length, exam);
    quiz = await quizModel.create({
      examId,
      topicId: null,
      type: "daily-challenge",
      title,
      questions: sampled.map((q) => q._id),
      durationMinutes,
      pullRule: { count: sampled.length },
      createdBy: userId,
    });
  }

  const attempt = await attemptModel
    .findOne({ quizId: quiz._id, userId })
    .sort({ createdAt: -1 })
    .lean();

  const streak = await getOrCreateStreakDoc(userId, examId);
  const completedToday = streak.lastCompletedDate === day;

  const questions = await questionModel
    .find({ _id: { $in: quiz.questions } })
    .select(
      "questionText options difficulty topicId questionMedia optionMedia answerMode questionType"
    );
  const map = new Map(questions.map((q) => [String(q._id), q]));
  const ordered = quiz.questions.map((id) => map.get(String(id))).filter(Boolean);

  return {
    quizId: quiz._id,
    title: quiz.title,
    totalQuestions: ordered.length,
    durationMinutes: quiz.durationMinutes || estimateDurationMinutes(ordered.length, exam),
    questions: ordered,
    attempted: !!attempt,
    lastScorePercent: attempt?.scorePercent ?? null,
    completedToday,
    streak: {
      current: streak.currentStreak || 0,
      longest: streak.longestStreak || 0,
      lastCompletedDate: streak.lastCompletedDate,
      today: day,
    },
  };
};

/** After a successful daily attempt, bump streak if first completion today. */
const recordDailyCompletion = async (userId, examId, quizId) => {
  const day = todayIst();
  const streak = await getOrCreateStreakDoc(userId, examId);

  if (streak.lastCompletedDate === day) {
    return streak;
  }

  const yday = yesterdayIst();
  let next = 1;
  if (streak.lastCompletedDate === yday) {
    next = (streak.currentStreak || 0) + 1;
  }

  streak.currentStreak = next;
  streak.longestStreak = Math.max(streak.longestStreak || 0, next);
  streak.lastCompletedDate = day;
  streak.lastDailyQuizId = quizId;
  await streak.save();
  return streak;
};

const getStreakSummary = async (examId, userId) => {
  const day = todayIst();
  const streak = await getOrCreateStreakDoc(userId, examId);
  const quiz = await quizModel
    .findOne({
      examId,
      type: "daily-challenge",
      createdBy: userId,
      title: `Daily Challenge · ${day}`,
    })
    .select("_id")
    .lean();

  let attempted = false;
  if (quiz) {
    attempted = !!(await attemptModel.exists({ quizId: quiz._id, userId }));
  }

  // Soft reset display if user missed a day (don't wipe DB until next completion)
  let current = streak.currentStreak || 0;
  if (
    streak.lastCompletedDate &&
    streak.lastCompletedDate !== day &&
    streak.lastCompletedDate !== yesterdayIst()
  ) {
    current = 0;
  }

  return {
    current,
    longest: streak.longestStreak || 0,
    lastCompletedDate: streak.lastCompletedDate,
    today: day,
    completedToday: streak.lastCompletedDate === day,
    attemptedToday: attempted || streak.lastCompletedDate === day,
    quizId: quiz?._id || null,
  };
};

/**
 * Per-topic readiness: quizzes with ≥1 attempt / READINESS_TARGET.
 */
const getTopicReadinessMap = async (examId, userId) => {
  const quizzes = await quizModel
    .find({
      examId,
      type: "topic-wise",
      createdBy: userId,
      questions: { $exists: true, $ne: [] },
    })
    .select("_id topicId")
    .lean();

  if (!quizzes.length) return new Map();

  const quizIds = quizzes.map((q) => q._id);
  const attempted = await attemptModel.distinct("quizId", {
    userId,
    quizId: { $in: quizIds },
  });
  const attemptedSet = new Set(attempted.map(String));

  const byTopic = new Map();
  for (const q of quizzes) {
    if (!q.topicId || !attemptedSet.has(String(q._id))) continue;
    const key = String(q.topicId);
    byTopic.set(key, (byTopic.get(key) || 0) + 1);
  }

  const out = new Map();
  for (const [topicId, solved] of byTopic) {
    const readinessPercent = Math.min(100, Math.round((solved / READINESS_TARGET) * 100));
    out.set(topicId, {
      quizzesSolved: solved,
      readinessTarget: READINESS_TARGET,
      readinessPercent,
      showProgress: solved >= 1,
    });
  }
  return out;
};

module.exports = {
  DAILY_COUNT,
  READINESS_TARGET,
  todayIst,
  getOrCreateDailyChallenge,
  recordDailyCompletion,
  getStreakSummary,
  getTopicReadinessMap,
};
