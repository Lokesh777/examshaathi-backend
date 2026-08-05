const mongoose = require("mongoose");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");
const questionModel = require("../models/question.model");
const { getTopicReadinessMap } = require("../services/dailyChallenge.service");

const listExams = async (req, res) => {
  try {
    const exams = await examModel
      .find()
      .select(
        "name slug syllabusStatus pattern questionProfile.optionCount questionProfile.markingScheme"
      );
    res.json({ success: true, data: exams });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const listTopics = async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user?._id || req.user?.id;
    const topics = await topicModel
      .find({ examId, deprecated: false })
      .select("name order weightage patternSection")
      .sort({ order: 1 })
      .lean();

    const topicIds = topics.map((t) => t._id);
    const counts =
      topicIds.length === 0
        ? []
        : await questionModel.aggregate([
            {
              $match: {
                examId: new mongoose.Types.ObjectId(examId),
                topicId: { $in: topicIds },
              },
            },
            { $group: { _id: "$topicId", count: { $sum: 1 } } },
          ]);

    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    const readinessMap = userId
      ? await getTopicReadinessMap(examId, userId)
      : new Map();

    const data = topics.map((t) => {
      const ready = readinessMap.get(String(t._id));
      return {
        ...t,
        questionCount: countMap.get(String(t._id)) || 0,
        quizzesSolved: ready?.quizzesSolved || 0,
        readinessTarget: ready?.readinessTarget || 5,
        readinessPercent: ready?.readinessPercent || 0,
        showProgress: ready?.showProgress || false,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { listExams, listTopics };
