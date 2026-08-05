const questionModel = require("../models/question.model");
const attemptModel = require("../models/attempt.model");
const quizModel = require("../models/quiz.model");
const examModel = require("../models/exam.model");
const {
  getExamQuestionProfile,
  isNotAttemptedAnswer,
} = require("../config/examQuestionProfiles");
const { recordDailyCompletion } = require("./dailyChallenge.service");

const submitAttempt = async (
  userId,
  quizId,
  userAnswers,
  timeTakenSeconds
) => {
  const quiz = await quizModel.findById(quizId);

  if (!quiz) {
    throw new Error("Quiz not found");
  }

  const exam = await examModel.findById(quiz.examId).lean();
  const profile = getExamQuestionProfile(exam);
  const marking = {
    correct: profile.markingScheme?.correct ?? 2,
    incorrect: profile.markingScheme?.incorrect ?? -(2 / 3),
    unanswered: profile.markingScheme?.unanswered ?? 0,
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
  let notAttemptedCount = 0;

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

    const isNotAttempted =
      isAnswered && isNotAttemptedAnswer(ans.selectedOption, question, profile);

    const isCorrect =
      isAnswered &&
      !isNotAttempted &&
      ans.selectedOption === question.correctAnswer;

    if (!isAnswered) {
      unansweredQuestions++;
      if (marking.unanswered !== 0) {
        score += marking.unanswered;
        negativeMarksDeducted += Math.abs(marking.unanswered);
      }
    } else if (isNotAttempted) {
      notAttemptedCount++;
      unansweredQuestions++;
      if (marking.unanswered !== 0) {
        score += marking.unanswered;
        negativeMarksDeducted += Math.abs(marking.unanswered);
      }
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
      questionMedia: question.questionMedia,
      optionMedia: question.optionMedia,
      answerMode: question.answerMode,
      questionType: question.questionType,
      selectedOption: ans.selectedOption || null,
      isCorrect,
    });
  }

  const totalQuestions = userAnswers.length;
  const totalMarks = totalQuestions * marking.correct;

  const finalScore = Number(score.toFixed(2));

  const finalNegativeMarksDeducted = Number(
    negativeMarksDeducted.toFixed(2)
  );

  const scorePercent =
    totalMarks > 0
      ? Number(((finalScore / totalMarks) * 100).toFixed(2))
      : 0;

  const passingMarksPercent = exam?.pattern?.passingMarksPercent ?? null;
  const passed =
    passingMarksPercent != null ? scorePercent >= passingMarksPercent : null;

  const blankPercent =
    totalQuestions > 0
      ? ((unansweredQuestions / totalQuestions) * 100).toFixed(1)
      : "0";

  const disqualifyThreshold = profile.markingScheme?.disqualifyBlankPercent;
  const disqualificationWarning =
    disqualifyThreshold != null &&
    (unansweredQuestions / totalQuestions) * 100 > disqualifyThreshold
      ? `More than ${disqualifyThreshold}% questions left blank — may lead to disqualification in real exam.`
      : null;

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

  if (quiz.type === "daily-challenge") {
    try {
      await recordDailyCompletion(userId, quiz.examId, quiz._id);
    } catch {
      /* streak update should not fail the attempt */
    }
  }

  return {
    attempt,
    summary: {
      correctAnswers,
      wrongAnswers,
      unansweredQuestions,
      notAttemptedCount,
      blankPercent,

      marksPerCorrect: marking.correct,
      negativeMarkPerWrong: Number(
        Math.abs(marking.incorrect).toFixed(2)
      ),
      negativeMarkPerUnanswered:
        marking.unanswered !== 0
          ? Number(Math.abs(marking.unanswered).toFixed(2))
          : 0,

      negativeMarksDeducted: finalNegativeMarksDeducted,
      disqualificationWarning,

      score: finalScore,
      totalMarks,
      scorePercent,
      passingMarksPercent,
      passed,
    },
    resultDetails,
  };
};

module.exports = {
  submitAttempt,
};