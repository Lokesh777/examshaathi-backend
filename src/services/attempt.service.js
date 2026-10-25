const questionModel = require("../models/question.model");
const attemptModel = require("../models/attempt.model");
const quizModel = require("../models/quiz.model");
const quizSessionModel = require("../models/quizSession.model");
const examModel = require("../models/exam.model");
const {
  getExamQuestionProfile,
  isNotAttemptedAnswer,
} = require("../config/examQuestionProfiles");
const { recordDailyCompletion } = require("./dailyChallenge.service");

const badRequest = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

// Client-reported time is untrusted: keep it a finite, non-negative number
// no larger than the quiz's allotted time (when known).
const clampTimeTaken = (value, durationMinutes) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  const maxSeconds = Number(durationMinutes) > 0 ? durationMinutes * 60 : Infinity;
  return Math.round(Math.min(n, maxSeconds));
};

// Prefer the server-measured time since the quiz was opened; fall back to
// the clamped client value for quizzes opened before sessions existed.
const resolveTimeTaken = async (userId, quiz, clientSeconds) => {
  const session = await quizSessionModel.findOneAndDelete({
    userId,
    quizId: quiz._id,
  });
  if (!session) return clampTimeTaken(clientSeconds, quiz.durationMinutes);
  const elapsed = (Date.now() - session.startedAt.getTime()) / 1000;
  return clampTimeTaken(elapsed, quiz.durationMinutes);
};

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

  if (!Array.isArray(userAnswers)) {
    throw badRequest("answers must be an array");
  }

  // One answer per question — the first submission for a question wins
  const answerById = new Map();
  for (const ans of userAnswers) {
    const id = ans?.questionId != null ? String(ans.questionId) : "";
    if (id && !answerById.has(id)) answerById.set(id, ans);
  }

  // Frozen quizzes are scored against their own question list, so unanswered
  // questions count as blanks and foreign question IDs are ignored.
  const frozenIds = (quiz.questions || []).map(String);
  const questionIds = frozenIds.length > 0 ? frozenIds : [...answerById.keys()];

  const questionFilter = { _id: { $in: questionIds } };
  if (frozenIds.length === 0) {
    const allowedTopics = [
      quiz.pullRule?.topicId,
      ...(quiz.pullRule?.sections || []).map((s) => s.topicId),
    ].filter(Boolean);
    if (allowedTopics.length > 0) {
      questionFilter.topicId = { $in: allowedTopics };
    }
  }

  const questions = await questionModel.find(questionFilter);

  const questionMap = new Map(
    questions.map((q) => [q._id.toString(), q])
  );

  const scoringList = questionIds
    .filter((id) => questionMap.has(id))
    .map((id) => answerById.get(id) || { questionId: id, selectedOption: null });

  let score = 0;

  let correctAnswers = 0;
  let wrongAnswers = 0;
  let unansweredQuestions = 0;
  let notAttemptedCount = 0;

  let negativeMarksDeducted = 0;

  const scoredAnswers = [];
  const resultDetails = [];

  for (const ans of scoringList) {
    const question = questionMap.get(String(ans.questionId));

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
      // Option E ("not attempted") is the sanctioned way to skip: no penalty
      // and it doesn't count toward the blank-sheet disqualification rule.
      notAttemptedCount++;
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
      questionMedia: question.questionMedia,
      optionMedia: question.optionMedia,
      answerMode: question.answerMode,
      questionType: question.questionType,
      selectedOption: ans.selectedOption || null,
      isCorrect,
    });
  }

  const totalQuestions = scoringList.length;
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

  // Fully blank questions only (option E answers are excluded)
  const blankCount = unansweredQuestions - notAttemptedCount;
  const blankPercent =
    totalQuestions > 0
      ? ((blankCount / totalQuestions) * 100).toFixed(1)
      : "0";

  const disqualifyThreshold = profile.markingScheme?.disqualifyBlankPercent;
  const disqualificationWarning =
    disqualifyThreshold != null &&
    totalQuestions > 0 &&
    (blankCount / totalQuestions) * 100 > disqualifyThreshold
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

    timeTakenSeconds: await resolveTimeTaken(userId, quiz, timeTakenSeconds),
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
      blankCount,
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