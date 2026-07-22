const questionModel = require("../models/question.model");
const quizModel = require("../models/quiz.model");

const getOrCreateTopicQuiz = async (examId, topicId, count = 20) => {
  const available = await questionModel.countDocuments({ topicId });
  if (available < count) {
    console.warn(`Bank has only ${available}/${count} for topic ${topicId}`);
  }

  let quiz = await quizModel.findOne({ examId, topicId, type: "topic-wise" });
  if (!quiz) {
    quiz = await quizModel.create({
      examId,
      topicId,
      type: "topic-wise",
      title: "Topic Practice",
      pullRule: { topicId, count },
    });
  }

  // ONLY safe fields go to the frontend at quiz-start time
  const questions = await questionModel.aggregate([
    { $match: { topicId: quiz.pullRule.topicId } },
    { $sample: { size: quiz.pullRule.count } },
    {
      $project: {
        questionText: 1,
        options: 1,
        difficulty: 1,
        // correctAnswer and explanation intentionally excluded
      },
    },
  ]);

  return { quiz, questions };
};

module.exports = { getOrCreateTopicQuiz };