const questionModel = require("../models/question.model");
const topicModel = require("../models/topic.model");
const examModel = require("../models/exam.model");
const quizModel = require("../models/quiz.model");
const attemptModel = require("../models/attempt.model");

// scales raw weightages proportionally so they sum EXACTLY to targetTotal
const scaleWeightagesToTarget = (topics, targetTotal) => {
  const rawTotal = topics.reduce((sum, t) => sum + (t.weightage || 0), 0);
  if (rawTotal === 0) return [];

  const scaled = topics.map((t) => ({
    topicId: t._id,
    name: t.name,
    exact: (t.weightage / rawTotal) * targetTotal,
  }));

  // floor each, then distribute the remainder to whichever topics lost the
  // most in rounding — guarantees the final sum is EXACTLY targetTotal
  let flooredSum = 0;
  const withFloor = scaled.map((s) => {
    const floor = Math.floor(s.exact);
    flooredSum += floor;
    return { ...s, floor, remainder: s.exact - floor };
  });

  let toDistribute = targetTotal - flooredSum;
  withFloor.sort((a, b) => b.remainder - a.remainder);

  return withFloor.map((s, i) => ({
    topicId: s.topicId,
    count: s.floor + (i < toDistribute ? 1 : 0),
  })).filter((s) => s.count > 0);
};

const getOrCreateRealPaperMock = async (examId) => {
  const exam = await examModel.findById(examId);
  if (!exam?.pattern?.sections?.length) {
    throw new Error("Exam pattern not set — run refreshExamPattern script first.");
  }

  let quiz = await quizModel.findOne({ examId, type: "real-paper" });

  if (!quiz) {
    const sections = [];

    for (const section of exam.pattern.sections) {
      const weightedTopics = await topicModel.find({
        examId,
        patternSection: section.topicName,
        weightage: { $ne: null },
        deprecated: false,
      });

      if (weightedTopics.length > 0) {
        // ALWAYS scale to the official section.questionCount —
        // this makes the system robust to imperfect estimate data forever
        const scaledSections = scaleWeightagesToTarget(weightedTopics, section.questionCount);
        sections.push(...scaledSections);
        continue;
      }

      // fallback: no weightage data at all — equal split
      const topicsInSection = await topicModel.find({
        examId,
        patternSection: section.topicName,
        deprecated: false,
      });
      if (topicsInSection.length === 0) continue;

      const perTopicBase = Math.floor(section.questionCount / topicsInSection.length);
      let remainder = section.questionCount % topicsInSection.length;
      for (const topic of topicsInSection) {
        const count = perTopicBase + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        if (count > 0) sections.push({ topicId: topic._id, count });
      }
    }

    quiz = await quizModel.create({
      examId,
      topicId: null,
      type: "real-paper",
      title: `${exam.name} — Full Mock Paper`,
      pullRule: { sections },
    });
  }

  const allQuestions = [];
  const shortfalls = [];

  for (const s of quiz.pullRule.sections) {
    const available = await questionModel.countDocuments({ topicId: s.topicId });
    const sampleSize = Math.min(s.count, available);

    if (available < s.count) {
      const topic = await topicModel.findById(s.topicId);
      shortfalls.push({ topic: topic?.name, needed: s.count, available });
    }

    if (sampleSize > 0) {
      const sampled = await questionModel.aggregate([
        { $match: { topicId: s.topicId } },
        { $sample: { size: sampleSize } },
        { $project: { questionText: 1, options: 1, difficulty: 1, topicId: 1 } },
      ]);
      allQuestions.push(...sampled);
    }
  }

  if (shortfalls.length > 0) console.warn("Bank shortfalls:", shortfalls);

  return { quiz, questions: allQuestions, shortfalls };
};

// extracted — same section-building logic you already have, just pulled into its own fn
const buildPullRuleSections = async (exam) => {
  const sections = [];
  for (const section of exam.pattern.sections) {
    const weightedTopics = await topicModel.find({
      examId: exam._id,
      patternSection: section.topicName,
      weightage: { $ne: null },
      deprecated: false,
    });

    if (weightedTopics.length > 0) {
      sections.push(...scaleWeightagesToTarget(weightedTopics, section.questionCount));
      continue;
    }

    const topicsInSection = await topicModel.find({
      examId: exam._id,
      patternSection: section.topicName,
      deprecated: false,
    });
    if (topicsInSection.length === 0) continue;

    const perTopicBase = Math.floor(section.questionCount / topicsInSection.length);
    let remainder = section.questionCount % topicsInSection.length;
    for (const topic of topicsInSection) {
      const count = perTopicBase + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      if (count > 0) sections.push({ topicId: topic._id, count });
    }
  }
  return sections;
};

// CREATE — always makes a brand-new, separately named, FROZEN paper
const createRealPaperMock = async (examId, userId, title) => {
  const exam = await examModel.findById(examId);
  if (!exam?.pattern?.sections?.length) {
    throw new Error("Exam pattern not set — run refreshExamPattern script first.");
  }

  const sections = await buildPullRuleSections(exam);
  const allQuestionIds = [];
  const shortfalls = [];

  for (const s of sections) {
    const available = await questionModel.countDocuments({ topicId: s.topicId });
    const sampleSize = Math.min(s.count, available);

    if (available < s.count) {
      const topic = await topicModel.findById(s.topicId);
      shortfalls.push({ topic: topic?.name, needed: s.count, available });
    }

    if (sampleSize > 0) {
      const sampled = await questionModel.aggregate([
        { $match: { topicId: s.topicId } },
        { $sample: { size: sampleSize } },
        { $project: { _id: 1 } },
      ]);
      allQuestionIds.push(...sampled.map((q) => q._id));
    }
  }

  let finalTitle = title;
  if (!finalTitle) {
    const existingCount = await quizModel.countDocuments({ examId, type: "real-paper", createdBy: userId });
    finalTitle = `Sample Paper ${existingCount + 1}`;
  }

  const quiz = await quizModel.create({
    examId,
    topicId: null,
    type: "real-paper",
    title: finalTitle,
    questions: allQuestionIds, // <-- FROZEN here, this is the fix
    pullRule: { sections },
    createdBy: userId,
  });

  const questions = await questionModel
    .find({ _id: { $in: allQuestionIds } })
    .select("questionText options difficulty topicId"); // no correctAnswer/explanation at start time

  return { quiz, questions, shortfalls };
};

// RETAKE — serve the SAME frozen question set from an existing paper
const getRealPaperMockById = async (quizId) => {
  const quiz = await quizModel.findById(quizId);
  if (!quiz || quiz.type !== "real-paper") throw new Error("Mock paper not found");

  const questions = await questionModel
    .find({ _id: { $in: quiz.questions } })
    .select("questionText options difficulty topicId");

  return { quiz, questions };
};

// LIST — all named papers this user created for this exam, with attempted status
const listRealPaperMocks = async (examId, userId) => {
  const quizzes = await quizModel
    .find({ examId, type: "real-paper", createdBy: userId })
    .sort({ createdAt: -1 })
    .lean();

  const quizIds = quizzes.map((q) => q._id);
  const attempts = await attemptModel
    .find({ quizId: { $in: quizIds }, userId })
    .sort({ submittedAt: -1 })
    .lean();

  const latestAttemptByQuiz = new Map();
  for (const a of attempts) {
    const key = String(a.quizId);
    if (!latestAttemptByQuiz.has(key)) latestAttemptByQuiz.set(key, a); // most recent first, since sorted desc
  }

  return quizzes.map((q) => {
    const attempt = latestAttemptByQuiz.get(String(q._id));
    return {
      quizId: q._id,
      title: q.title,
      totalQuestions: q.questions.length,
      createdAt: q.createdAt,
      attempted: !!attempt,
      lastScore: attempt?.score ?? null,
      lastScorePercent: attempt?.scorePercent ?? null,
      lastAttemptId: attempt?._id ?? null,
    };
  });
};

// RENAME
const renameRealPaperMock = async (quizId, userId, newTitle) => {
  const quiz = await quizModel.findOneAndUpdate(
    { _id: quizId, createdBy: userId, type: "real-paper" },
    { title: newTitle },
    { new: true }
  );
  if (!quiz) throw new Error("Mock paper not found or not yours");
  return quiz;
};

module.exports = {
  getOrCreateRealPaperMock,
  createRealPaperMock,
  getRealPaperMockById,
  renameRealPaperMock,
  listRealPaperMocks,
 };