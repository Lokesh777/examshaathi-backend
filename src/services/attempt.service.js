const questionModel = require("../models/question.model");
const attemptModel = require("../models/attempt.model");
const quizModel = require("../models/quiz.model");

const submitAttempt = async (
  userId,
  quizId,
  userAnswers,
  timeTakenSeconds
) => {
  // userAnswers: [{ questionId, selectedOption }]

  const quiz = await quizModel.findById(quizId);

  if (!quiz) {
    throw new Error("Quiz not found");
  }

  // =========================================================
  // Rajasthan CET 12th Level Marking Scheme
  //
  // ✔ Correct Answer   : +2 Marks
  // ✔ Wrong Answer     : -2/3 Marks (-0.67)
  // ✔ Unanswered       : 0 Marks
  //
  // NOTE:
  // Currently this marking scheme is applied to ALL quizzes.
  // If different exams have different marking schemes later,
  // move these values to the exam configuration.
  // =========================================================

  const marking = {
    correct: 2,
    incorrect: -(2 / 3),
  };

  const questionIds = userAnswers.map((a) => a.questionId);

  const questions = await questionModel.find({
    _id: { $in: questionIds },
  });

  const questionMap = new Map(
    questions.map((q) => [q._id.toString(), q])
  );

  let score = 0;

  let correctAnswers = 0;
  let wrongAnswers = 0;
  let unansweredQuestions = 0;

  let negativeMarksDeducted = 0;

  const scoredAnswers = [];
  const resultDetails = [];

  for (const ans of userAnswers) {
    const question = questionMap.get(ans.questionId.toString());

    if (!question) continue;

    const isAnswered =
      ans.selectedOption !== undefined &&
      ans.selectedOption !== null &&
      ans.selectedOption !== "";

    const isCorrect =
      isAnswered &&
      ans.selectedOption === question.correctAnswer;

    if (!isAnswered) {
      unansweredQuestions++;
    } else if (isCorrect) {
      correctAnswers++;
      score += marking.correct;
    } else {
      wrongAnswers++;
      score += marking.incorrect;
      negativeMarksDeducted += Math.abs(marking.incorrect);
    }

    scoredAnswers.push({
      questionId: question._id,
      selectedOption: ans.selectedOption || null,
      isCorrect,
    });

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
  const totalMarks = totalQuestions * marking.correct;

  // Round all calculated values to 2 decimal places
  const finalScore = Number(score.toFixed(2));

  const finalNegativeMarksDeducted = Number(
    negativeMarksDeducted.toFixed(2)
  );

  const scorePercent =
    totalMarks > 0
      ? Number(((finalScore / totalMarks) * 100).toFixed(2))
      : 0;

  const attempt = await attemptModel.create({
    userId,
    quizId,
    examId: quiz.examId,

    answers: scoredAnswers,

    score: finalScore,
    totalQuestions,
    totalMarks,
    scorePercent,

    correctAnswers,
    wrongAnswers,
    unansweredQuestions,
    negativeMarksDeducted: finalNegativeMarksDeducted,

    timeTakenSeconds,
  });

  return {
    attempt,
    summary: {
      correctAnswers,
      wrongAnswers,
      unansweredQuestions,

      marksPerCorrect: marking.correct,
      negativeMarkPerWrong: Number(
        Math.abs(marking.incorrect).toFixed(2)
      ),

      negativeMarksDeducted: finalNegativeMarksDeducted,

      score: finalScore,
      totalMarks,
      scorePercent,
    },
    resultDetails,
  };
};

module.exports = {
  submitAttempt,
};