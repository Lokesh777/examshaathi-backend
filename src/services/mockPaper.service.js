const questionModel = require("../models/question.model");
const topicModel = require("../models/topic.model");
const examModel = require("../models/exam.model");
const quizModel = require("../models/quiz.model");

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

module.exports = { getOrCreateRealPaperMock };