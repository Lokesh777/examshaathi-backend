/**
 * Scale quiz time to question count — never use full-paper duration for short sets.
 * CET example: 150 min / 120 Q ≈ 1.25 min/Q → 20 Q = 25 min.
 */
const estimateDurationMinutes = (questionCount, exam) => {
  const n = Math.max(1, Number(questionCount) || 1);
  const totalQ = exam?.pattern?.totalQuestions || 0;
  const totalMin = exam?.pattern?.durationMinutes || 0;
  if (totalQ > 0 && totalMin > 0) {
    return Math.max(5, Math.round((n * totalMin) / totalQ));
  }
  // ~1 minute per question when exam pattern is missing
  return Math.max(5, Math.round(n * 1));
};

module.exports = { estimateDurationMinutes };
