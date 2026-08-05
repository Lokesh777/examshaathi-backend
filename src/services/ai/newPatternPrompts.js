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

const formatAvoidList = (avoidList) => {
  if (!avoidList?.length) return "";
  const lines = avoidList
    .slice(0, 60)
    .map((t, i) => `${i + 1}. ${String(t).slice(0, 180)}`)
    .join("\n");
  return `
ANTI-DUPLICATE (critical):
- Do NOT rewrite, paraphrase, or lightly edit any of the questions below.
- Every new question must test a DIFFERENT fact, concept, year, person, place, or skill.
- If you cannot invent a truly new angle, invent a different sub-fact within the same syllabus topic.

Existing / banned stems:
${lines}`;
};

const formatReferenceExamples = (examples) => {
  if (!examples?.length) return "";
  const blocks = examples.map((ex, i) => {
    const opts = (ex.options || [])
      .slice(0, 5)
      .map((o, j) => `  ${String.fromCharCode(65 + j)}. ${o}`)
      .join("\n");
    const expl = ex.explanation
      ? `\nWhy (for style only): ${String(ex.explanation).slice(0, 220)}`
      : "";
    return `Example ${i + 1} [${ex.questionType || "direct"}${ex.source ? ` / ${ex.source}` : ""}]:
Q: ${String(ex.questionText || "").slice(0, 650)}
${opts}${expl}`;
  });
  return `
GOLD-STANDARD REFERENCES (prefer previous-paper / admin imports):
- Copy TONE, DEPTH, OPTION STYLE, and FORMAT only.
- Do NOT copy facts, names, years, or wording.
- Write ORIGINAL questions at equal or higher quality.

${blocks.join("\n\n")}`;
};

const buildBaseInstructions = (
  examName,
  topic,
  profile,
  count,
  avoidListText = "",
  referenceText = "",
  examContextText = ""
) => {
  const topicName = typeof topic === "string" ? topic : topic.name;
  const lang = resolveTopicLanguage(typeof topic === "object" ? topic : { name: topicName });
  const optionCount = profile.optionCount || 4;
  const fifthNote =
    optionCount === 5
      ? `- Each question MUST have exactly 5 options. The 5th option MUST be: "${profile.fifthOptionText}"`
      : `- Each question must have exactly 4 options (A–D).`;

  return `
You are writing questions for "${examName}" (Rajasthan government competitive exam).
Content language for this topic: ${lang.toUpperCase()}.

EXAM / SYLLABUS CONTEXT:
${examContextText || `Topic: ${topicName}`}

Generate EXACTLY ${count} high-quality multiple-choice question(s) of the REQUIRED type below.

QUALITY RULES (mandatory):
${languageBlock(typeof topic === "object" ? topic : { name: topicName }, lang)}
${fifthNote}
- correctAnswer must exactly match one of the options (same string).
- explanation is MANDATORY (2–4 lines): say why the correct option is right AND why a close distractor is wrong.
- difficulty must be EXACTLY one of: "easy", "moderate", "hard". Aim for a mix; prefer "moderate".
- Options A–D must be distinct; no duplicated options.
- Distractors must be plausible (common mistakes), not silly or obviously wrong.
- Do not ask vague "which is correct?" without enough information in the stem.
- Do not invent fake schemes, fake court cases, or unverifiable recent news.
- Do not repeat questions within this batch.
${referenceText}
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

const withLists = (ctx) => {
  const avoidListText = formatAvoidList(ctx.avoidList);
  const referenceText = formatReferenceExamples(ctx.referenceExamples);
  const examContextText = ctx.examContext || "";
  return { avoidListText, referenceText, examContextText };
};

const buildStatementPrompt = (ctx) => {
  const { exam, topic, count, profile } = ctx;
  const { avoidListText, referenceText, examContextText } = withLists(ctx);
  const lang = resolveTopicLanguage(topic);

  const optionHint =
    lang === "english"
      ? '- Options (A-D) must be combinations like "Only 1 and 2", "Only 2 and 3", "1 and 3", "All of the above".'
      : '- Options (A-D) must be combinations like "केवल 1 और 2", "केवल 2 और 3", "1 और 3", "सभी उपर्युक्त".';

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText, referenceText, examContextText)}

REQUIRED QUESTION TYPE: statement (Statement-based) — NOT a direct MCQ.
- questionText MUST list 3–4 numbered statements (1. 2. 3. …).
- At least ONE statement must be incorrect or partially correct.
- Statements must be fact-checkable and on-topic.
${optionHint}
- Set questionType to exactly "statement".`;
};

const buildMatchingPrompt = (ctx) => {
  const { exam, topic, count, profile } = ctx;
  const { avoidListText, referenceText, examContextText } = withLists(ctx);

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText, referenceText, examContextText)}

REQUIRED QUESTION TYPE: matching (कूट-मिलाप) — NOT a direct MCQ.
- questionText MUST include List I (A–D) and List II (i–iv) with real paired concepts from this topic.
- Options must be coded matches like "A-ii, B-iv, C-i, D-iii" (with clear distractors).
- Set questionType to exactly "matching".`;
};

const buildAssertionReasonPrompt = (ctx) => {
  const { exam, topic, count, profile } = ctx;
  const { avoidListText, referenceText, examContextText } = withLists(ctx);
  const lang = resolveTopicLanguage(topic);

  const optionsBlock =
    lang === "english"
      ? `(A) Both A and R are true and R is the correct explanation of A.
(B) Both A and R are true but R is not the correct explanation of A.
(C) A is true but R is false.
(D) A is false but R is true.`
      : `(A) दोनों A और R सत्य हैं तथा R, A की सही व्याख्या है।
(B) दोनों A और R सत्य हैं परन्तु R, A की सही व्याख्या नहीं है।
(C) A सत्य है परन्तु R असत्य है।
(D) A असत्य है परन्तु R सत्य है।`;

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText, referenceText, examContextText)}

REQUIRED QUESTION TYPE: assertion_reason — NOT a direct MCQ.
- questionText MUST contain Assertion (A) and Reason (R) that are conceptually related to this topic.
- Options A–D MUST be exactly this standard set (language matched):
${optionsBlock}
- Set questionType to exactly "assertion_reason".`;
};

const buildChronologyPrompt = (ctx) => {
  const { exam, topic, count, profile } = ctx;
  const { avoidListText, referenceText, examContextText } = withLists(ctx);

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText, referenceText, examContextText)}

REQUIRED QUESTION TYPE: chronology (कालक्रम) — NOT a direct MCQ.
- Provide 4 distinct numbered events/steps with real chronological order for this topic.
- State whether order is earliest→latest (or reverse).
- Options must be different sequences like "1-2-3-4", "2-1-4-3".
- Set questionType to exactly "chronology".`;
};

const buildAppliedPedagogyPrompt = (ctx) => {
  const { exam, topic, count, profile } = ctx;
  const { avoidListText, referenceText, examContextText } = withLists(ctx);

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText, referenceText, examContextText)}

REQUIRED QUESTION TYPE: applied_pedagogy
- Present a realistic classroom scenario (4–6 lines) tied to this topic.
- All four answer options should seem reasonable; only ONE is best practice.
- Set questionType to exactly "applied_pedagogy".`;
};

const buildDirectPrompt = (ctx) => {
  const { exam, topic, count, profile } = ctx;
  const { avoidListText, referenceText, examContextText } = withLists(ctx);

  return `${buildBaseInstructions(exam.name, topic, profile, count, avoidListText, referenceText, examContextText)}

REQUIRED QUESTION TYPE: direct (classic MCQ)
- Standard competitive exam MCQ with a clear stem and 4 content options.
- Prefer conceptual / analytical wording over one-word recall when possible.
- NOT statement/matching/A&R/chronology format.
- Set questionType to exactly "direct".`;
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

  return `You are cleaning and structuring REAL exam questions for "${exam.name}" (Rajasthan government exam).

Valid topics:
${topicListText}

TASK:
- Extract or structure every complete MCQ from the input below (OCR / PDF / pasted paper text).
- DO NOT invent new questions. Only use content present in the input.
- Fix obvious OCR glitches in wording when the intended option/stem is clear; never change the meaning or the correct answer.
- Infer questionType: direct | statement | matching | assertion_reason | chronology | applied_pedagogy
- ${fifthNote}
- For each question assign topicNumber OR topicName (exact name from list above).
- correctAnswer must match one option exactly.
- explanation: use source explanation if present; otherwise write a brief accurate justification (1–2 lines) without inventing new facts not implied by the question.
- Keep language consistent with the source (Hindi Devanagari or English). Arabic numerals for numbers.

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
