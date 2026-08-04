/**
 * Rajasthan government exam new-pattern AI prompt templates.
 * Used by questionGeneration, admin import normalize, and batch scripts.
 */

const QUESTION_TYPES = {
  direct: { id: "direct", label: "Direct MCQ", labelHi: "प्रत्यक्ष प्रश्न" },
  statement: { id: "statement", label: "Statement-based", labelHi: "कथन-आधारित" },
  matching: { id: "matching", label: "Matching (Koot-Milap)", labelHi: "कूट-मिलाप" },
  assertion_reason: {
    id: "assertion_reason",
    label: "Assertion & Reason",
    labelHi: "अभिकथन और कारण",
  },
  chronology: { id: "chronology", label: "Chronological Order", labelHi: "कालक्रम" },
  applied_pedagogy: {
    id: "applied_pedagogy",
    label: "Applied Pedagogy",
    labelHi: "व्यावहारिक शिक्षाशास्त्र",
  },
};

/** Infer question language from topic name + official pattern section. */
const resolveTopicLanguage = (topic) => {
  const name = (topic?.name || "").trim();
  const section = (topic?.patternSection || "").trim();

  const englishTopic =
    /english|grammar|tense|voice|narration|comprehension|synonym|antonym|vocabulary|idiom|preposition|article|substitution|letter writing|translation/i.test(
      name
    );
  const englishSection = /सामान्य अंग्रेजी|general english/i.test(section);

  if (englishTopic || englishSection) return "english";

  const hindiSection = /सामान्य हिंदी|सामान्य हिन्दी|general hindi/i.test(section);
  const mostlyDevanagari = /[\u0900-\u097F]/.test(name) && !/[a-zA-Z]{5,}/.test(name);
  if (hindiSection || mostlyDevanagari) return "hindi";

  return "hindi";
};

const languageBlock = (topic, lang) => {
  const focus = `Stay strictly on syllabus topic: "${topic.name}"${
    topic.patternSection ? ` (section: ${topic.patternSection})` : ""
  }.`;

  if (lang === "english") {
    return `- LANGUAGE: Write questionText, ALL options, and explanation in ENGLISH only.
- Do NOT use Hindi or Devanagari in the question, options, or explanation.
- ${focus}
- For grammar topics: test the specific skill named in the topic (tense, voice, narration, articles, prepositions, etc.).`;
  }

  return `- LANGUAGE: Write questionText, all options, and explanation in HINDI (Devanagari script).
- ${focus}
- ALL NUMBERS must be English/Arabic numerals (1576, not १५७६).`;
};

const buildBaseInstructions = (examName, topic, profile, count, avoidListText = "") => {
  const topicName = typeof topic === "string" ? topic : topic.name;
  const lang = resolveTopicLanguage(typeof topic === "object" ? topic : { name: topicName });
  const optionCount = profile.optionCount || 4;
  const fifthNote =
    optionCount === 5
      ? `- Each question MUST have exactly 5 options. The 5th option MUST be: "${profile.fifthOptionText}"`
      : `- Each question must have exactly 4 options.`;

  return `
You are an expert exam paper setter for Rajasthan government exams ("${examName}").
Syllabus topic: "${topicName}".
Content language for this topic: ${lang.toUpperCase()}.

Generate EXACTLY ${count} multiple-choice question(s).

STRICT RULES:
${languageBlock(typeof topic === "object" ? topic : { name: topicName }, lang)}
${fifthNote}
- correctAnswer must exactly match one of the options (same string).
- explanation is MANDATORY (1-3 lines; longer for pedagogy questions).
- difficulty must be EXACTLY one of: "easy", "moderate", "hard".
- Questions should be lengthy and analytical (4-6 lines where appropriate) — NOT simple one-liner recall.
- Do not repeat questions within this batch.
${avoidListText}

Return ONLY valid JSON, no markdown:
{
  "questions": [
    {
      "questionType": "...",
      "questionText": "...",
      "options": [...],
      "correctAnswer": "...",
      "explanation": "...",
      "difficulty": "moderate"
    }
  ]
}`;
};

const buildStatementPrompt = (ctx) => {
  const { exam, topic, count, profile, avoidList } = ctx;
  const lang = resolveTopicLanguage(topic);
  const avoidListText =
    avoidList?.length > 0
      ? `\nDO NOT duplicate these existing questions:\n${avoidList.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "";

  const optionHint =
    lang === "english"
      ? '- Options (A-D) must be combinations like "Only 1 and 2", "Only 2 and 3", "1 and 3", "All of the above".'
      : '- Options (A-D) must be combinations like "केवल 1 और 2", "केवल 2 और 3", "1 और 3", "सभी उपर्युक्त".';

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText)}

QUESTION TYPE: Statement-based
- Present 3-4 numbered factual statements about the topic.
- At least ONE statement must be incorrect or partially correct to test nuanced understanding.
${optionHint}
- Set questionType to "statement".`;
};

const buildMatchingPrompt = (ctx) => {
  const { exam, topic, count, profile, avoidList } = ctx;
  const avoidListText =
    avoidList?.length > 0
      ? `\nDO NOT duplicate:\n${avoidList.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "";

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText)}

QUESTION TYPE: Matching with codes (कूट-मिलाप)
- Create List I (4 items labelled A-D) and List II (4 items labelled i-iv).
- Options must be coded combinations like "A-ii, B-iv, C-i, D-iii".
- Include plausible but incorrect distractors.
- Include both lists in questionText with clear formatting.
- Set questionType to "matching".`;
};

const buildAssertionReasonPrompt = (ctx) => {
  const { exam, topic, count, profile, avoidList } = ctx;
  const avoidListText =
    avoidList?.length > 0
      ? `\nDO NOT duplicate:\n${avoidList.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "";

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText)}

QUESTION TYPE: Assertion and Reason (अभिकथन और कारण)
- Create Assertion (A) and Reason (R) statements in questionText.
- Options A-D must be the standard four:
  (A) Both A and R are true and R is the correct explanation of A.
  (B) Both A and R are true but R is not the correct explanation of A.
  (C) A is true but R is false.
  (D) A is false but R is true.
- Set questionType to "assertion_reason".`;
};

const buildChronologyPrompt = (ctx) => {
  const { exam, topic, count, profile, avoidList } = ctx;
  const avoidListText =
    avoidList?.length > 0
      ? `\nDO NOT duplicate:\n${avoidList.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "";

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText)}

QUESTION TYPE: Chronological ordering (कालक्रम)
- Provide 4 distinct events/steps to arrange earliest to latest (state direction in question).
- Options must be different sequences like "1-2-3-4", "2-1-4-3", etc.
- Set questionType to "chronology".`;
};

const buildAppliedPedagogyPrompt = (ctx) => {
  const { exam, topic, count, profile, avoidList } = ctx;
  const avoidListText =
    avoidList?.length > 0
      ? `\nDO NOT duplicate:\n${avoidList.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "";

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText)}

QUESTION TYPE: Applied Pedagogy (व्यावहारिक शिक्षाशास्त्र)
- Present a realistic classroom scenario or teacher dilemma (4-6 lines).
- All four answer options should seem reasonable; only ONE is the best pedagogical response.
- Reference modern pedagogical principles in the explanation.
- Set questionType to "applied_pedagogy".`;
};

const buildDirectPrompt = (ctx) => {
  const { exam, topic, count, profile, avoidList } = ctx;
  const avoidListText =
    avoidList?.length > 0
      ? `\nDO NOT duplicate:\n${avoidList.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "";

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText)}

QUESTION TYPE: Direct MCQ
- Standard competitive exam MCQ; can be analytical but not statement/matching format.
- Set questionType to "direct".`;
};

const buildPromptForType = (type, ctx) => {
  switch (type) {
    case "statement":
      return buildStatementPrompt(ctx);
    case "matching":
      return buildMatchingPrompt(ctx);
    case "assertion_reason":
      return buildAssertionReasonPrompt(ctx);
    case "chronology":
      return buildChronologyPrompt(ctx);
    case "applied_pedagogy":
      return buildAppliedPedagogyPrompt(ctx);
    case "direct":
    default:
      return buildDirectPrompt(ctx);
  }
};

const buildNormalizeImportPrompt = (exam, topics, rawText, profile) => {
  const topicListText = topics
    .map((t, i) => `${i + 1}. ${t.name} (topicNumber: ${i + 1})`)
    .join("\n");
  const optionCount = profile.optionCount || 4;
  const fifthNote =
    optionCount === 5
      ? `Each question must have exactly 5 options; 5th must be: "${profile.fifthOptionText}"`
      : "Each question must have exactly 4 options.";

  return `You are structuring exam questions for "${exam.name}" (Rajasthan government exam).

Valid topics:
${topicListText}

TASK:
- Extract or structure every complete MCQ from the input below.
- DO NOT invent content not present in the text.
- Infer questionType: direct | statement | matching | assertion_reason | chronology | applied_pedagogy
- ${fifthNote}
- For each question assign topicNumber OR topicName (exact Hindi name from list above).
- correctAnswer must match one option exactly.
- explanation required (brief if not in source).
- Hindi Devanagari; Arabic numerals.

Return ONLY valid JSON:
{
  "questions": [
    {
      "questionType": "statement",
      "questionText": "...",
      "options": ["...","...","...","...","..."],
      "correctAnswer": "...",
      "explanation": "...",
      "topicNumber": 1,
      "topicName": "विषय का हिंदी नाम",
      "difficulty": "moderate"
    }
  ]
}

Input:
"""
${rawText.slice(0, 12000)}
"""`;
};

module.exports = {
  QUESTION_TYPES,
  resolveTopicLanguage,
  buildBaseInstructions,
  buildStatementPrompt,
  buildMatchingPrompt,
  buildAssertionReasonPrompt,
  buildChronologyPrompt,
  buildAppliedPedagogyPrompt,
  buildDirectPrompt,
  buildPromptForType,
  buildNormalizeImportPrompt,
};
