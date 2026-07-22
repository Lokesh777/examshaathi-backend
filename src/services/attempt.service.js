const questionModel = require("../models/question.model");
const attemptModel = require("../models/attempt.model");
const quizModel = require("../models/quiz.model");

const submitAttempt = async (userId, quizId, userAnswers, timeTakenSeconds) => {
  // userAnswers: [{ questionId, selectedOption }]
  const quiz = await quizModel.findById(quizId);
  if (!quiz) throw new Error("Quiz not found");

  const questionIds = userAnswers.map((a) => a.questionId);
  const questions = await questionModel.find({ _id: { $in: questionIds } });
  const questionMap = new Map(questions.map((q) => [q._id.toString(), q]));

  let score = 0;
  const scoredAnswers = [];
  const resultDetails = [];

  for (const ans of userAnswers) {
    const question = questionMap.get(ans.questionId.toString());
    if (!question) continue; // guard against tampered/invalid IDs

    const isCorrect = ans.selectedOption === question.correctAnswer;
    if (isCorrect) score++;

    scoredAnswers.push({
      questionId: question._id,
      selectedOption: ans.selectedOption || null,
      isCorrect,
    });

    // this is what the result screen actually needs
    resultDetails.push({
      questionId: question._id,
      questionText: question.questionText,
      options: question.options,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      referenceLinks: question.referenceLinks,
      selectedOption: ans.selectedOption || null,
      isCorrect,
    });
  }

  const totalQuestions = userAnswers.length;
  const scorePercent = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

  const attempt = await attemptModel.create({
    userId,
    quizId,
    examId: quiz.examId,
    answers: scoredAnswers,
    score,
    totalQuestions,
    scorePercent,
    timeTakenSeconds,
  });

  return { attempt, resultDetails };
};

module.exports = { submitAttempt };