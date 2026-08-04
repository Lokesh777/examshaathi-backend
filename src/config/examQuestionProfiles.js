/**
 * Per-exam question generation / import / scoring profiles.
 * Keyed by exam.slug; DB exam.questionProfile overrides merge on top.
 */

const DEFAULT_PROFILE = {
  optionCount: 4,
  fifthOptionText: "(E) Question not attempted",
  defaultPattern: "new",
  language: "hindi",
  enabledQuestionTypes: ["direct", "statement", "matching", "assertion_reason", "chronology"],
  typeMix: {
    direct: 0.40,
    statement: 0.25,
    matching: 0.15,
    assertion_reason: 0.10,
    chronology: 0.10,
  },
  markingScheme: {
    correct: 2,
    incorrect: -(2 / 3),
    unanswered: 0,
    disqualifyBlankPercent: null,
  },
};

const SLUG_PROFILES = {
  "cet-12th": {
    optionCount: 5,
    fifthOptionText: "(E) प्रश्न का प्रयास नहीं किया गया",
    defaultPattern: "old",
    enabledQuestionTypes: ["direct"],
    typeMix: { direct: 1.0 },
    markingScheme: {
      correct: 2,
      incorrect: -(2 / 3),
      unanswered: -(2 / 3),
      disqualifyBlankPercent: 10,
    },
  },
  reet: {
    optionCount: 5,
    fifthOptionText: "(E) प्रश्न का प्रयास नहीं किया गया",
    defaultPattern: "new",
    enabledQuestionTypes: [
      "direct",
      "statement",
      "matching",
      "assertion_reason",
      "chronology",
      "applied_pedagogy",
    ],
    typeMix: {
      statement: 0.30,
      matching: 0.15,
      assertion_reason: 0.15,
      chronology: 0.10,
      applied_pedagogy: 0.20,
      direct: 0.10,
    },
    markingScheme: {
      correct: 2,
      incorrect: -(2 / 3),
      unanswered: -(2 / 3),
      disqualifyBlankPercent: 10,
    },
  },
  "rpsc-3rd-grade": {
    optionCount: 5,
    fifthOptionText: "(E) प्रश्न का प्रयास नहीं किया गया",
    defaultPattern: "new",
    enabledQuestionTypes: [
      "direct",
      "statement",
      "matching",
      "assertion_reason",
      "chronology",
      "applied_pedagogy",
    ],
    typeMix: {
      statement: 0.25,
      matching: 0.15,
      assertion_reason: 0.15,
      chronology: 0.10,
      applied_pedagogy: 0.25,
      direct: 0.10,
    },
    markingScheme: {
      correct: 2,
      incorrect: -(2 / 3),
      unanswered: -(2 / 3),
      disqualifyBlankPercent: 10,
    },
  },
  "rpsc-2nd-grade": {
    optionCount: 5,
    fifthOptionText: "(E) प्रश्न का प्रयास नहीं किया गया",
    defaultPattern: "new",
    enabledQuestionTypes: [
      "direct",
      "statement",
      "matching",
      "assertion_reason",
      "chronology",
    ],
    typeMix: {
      statement: 0.30,
      matching: 0.20,
      assertion_reason: 0.20,
      chronology: 0.15,
      direct: 0.15,
    },
    markingScheme: {
      correct: 2,
      incorrect: -(2 / 3),
      unanswered: -(2 / 3),
      disqualifyBlankPercent: 10,
    },
  },
};

const deepMerge = (base, override) => {
  if (!override || typeof override !== "object") return { ...base };
  const out = { ...base };
  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val && typeof val === "object" && !Array.isArray(val) && base[key]) {
      out[key] = deepMerge(base[key], val);
    } else if (val !== undefined && val !== null) {
      out[key] = val;
    }
  }
  return out;
};

const getExamQuestionProfile = (exam) => {
  const slug = (exam?.slug || "").toLowerCase();
  const slugProfile = SLUG_PROFILES[slug] || {};
  const merged = deepMerge(DEFAULT_PROFILE, slugProfile);
  if (exam?.questionProfile) {
    return deepMerge(merged, exam.questionProfile.toObject?.() ?? exam.questionProfile);
  }
  return merged;
};

/** Weighted random pick from typeMix, respecting enabledQuestionTypes. */
const pickQuestionType = (profile, explicitType) => {
  if (explicitType && explicitType !== "auto") {
    if (profile.enabledQuestionTypes.includes(explicitType)) return explicitType;
    return "direct";
  }
  const mix = profile.typeMix || {};
  const entries = Object.entries(mix).filter(([t, w]) => w > 0 && profile.enabledQuestionTypes.includes(t));
  if (entries.length === 0) return profile.enabledQuestionTypes[0] || "direct";
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [type, weight] of entries) {
    r -= weight;
    if (r <= 0) return type;
  }
  return entries[entries.length - 1][0];
};

/** Ensure options array has exactly optionCount items; append 5th if missing. */
const ensureOptionCount = (options, profile) => {
  const opts = [...(options || [])];
  const target = profile.optionCount || 4;
  while (opts.length < target - 1 && opts.length < 4) {
    opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
  }
  if (target === 5 && opts.length === 4) {
    opts.push(profile.fifthOptionText || "(E) Question not attempted");
  }
  return opts.slice(0, target);
};

/** True when selected answer is the intentional "not attempted" option E. */
const isNotAttemptedAnswer = (selectedOption, question, profile) => {
  if (!selectedOption) return false;
  const fifth = profile.fifthOptionText || "(E) Question not attempted";
  const opts = question.options || [];
  const eOption = opts.length >= 5 ? opts[4] : fifth;
  return (
    selectedOption === "E" ||
    selectedOption === eOption ||
    selectedOption === fifth ||
    (typeof selectedOption === "string" && selectedOption.includes("प्रयास नहीं"))
  );
};

module.exports = {
  DEFAULT_PROFILE,
  SLUG_PROFILES,
  getExamQuestionProfile,
  pickQuestionType,
  ensureOptionCount,
  isNotAttemptedAnswer,
};
