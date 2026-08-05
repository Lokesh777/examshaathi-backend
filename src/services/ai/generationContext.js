/**
 * Build rich generation context from exam + topic + sibling syllabus topics.
 * Used to improve AI question quality without scraping external sites.
 */

const topicModel = require("../../models/topic.model");

const SECTION_HINTS = [
  {
    test: /राजस्थान|rajasthan|इतिहास|history|भूगोल|geography|कला|culture|पर्यटन|economy|अर्थव्यवस्था/i,
    hint: `Focus on Rajasthan-specific, exam-standard facts (dynasties, forts, districts, rivers, schemes, folk arts). Prefer widely taught textbook facts over obscure trivia. Use accurate years/names.`,
  },
  {
    test: /हिंदी|हिन्दी|hindi|व्याकरण|संधि|समास|रस|अलंकार|मुहावरे/i,
    hint: `Test Hindi grammar/literature skills precisely (sandhi, samas, ras, alankar, muhavare). Avoid ambiguous answers; one option must be clearly correct.`,
  },
  {
    test: /english|grammar|tense|voice|narration|preposition|article|vocabulary|comprehension/i,
    hint: `Test the exact English skill in the topic name. Use clear, unambiguous grammar. Distractors should be common student mistakes.`,
  },
  {
    test: /गणित|math|reasoning|संख्या|संख्यात्मक|बौद्धिक|aptitude/i,
    hint: `Give enough data to solve. Keep calculations reasonable for timed MCQs. Distractors should come from common calculation errors.`,
  },
  {
    test: /शिक्षा|शिक्षण|pedagog|बाल|मनोविज्ञान|curriculum|NCF|RTE/i,
    hint: `Prefer applied classroom scenarios and NEP/NCF/RTE-aligned pedagogy. Avoid outdated rote definitions when application is better.`,
  },
  {
    test: /विज्ञान|science|भौतिक|रसायन|जीव|biology|physics|chemistry/i,
    hint: `Use standard class-level science facts. Keep units and formulas correct. Do not invent dubious recent discoveries.`,
  },
  {
    test: /कंप्यूटर|computer|ICT|internet|MS|Excel|Word/i,
    hint: `Use current mainstream computer/ICT facts suitable for government exams. Avoid vendor-specific niche trivia.`,
  },
];

const sectionQualityHint = (topic) => {
  const blob = `${topic?.name || ""} ${topic?.patternSection || ""}`;
  for (const row of SECTION_HINTS) {
    if (row.test.test(blob)) return row.hint;
  }
  return `Stay strictly inside this syllabus topic. Prefer high-yield competitive-exam facts over trivia.`;
};

const formatExamContext = (exam, topic, siblingTopics = []) => {
  const p = exam?.pattern || {};
  const lines = [
    `Exam: ${exam?.name || "Rajasthan government exam"} (slug: ${exam?.slug || "n/a"})`,
    `Topic: ${topic?.name || ""}`,
  ];
  if (topic?.patternSection) lines.push(`Official pattern section: ${topic.patternSection}`);
  if (topic?.weightage != null) {
    lines.push(
      `Topic weightage estimate: ${topic.weightage}% (${topic.weightageConfidence || "estimated"})`
    );
  }
  if (p.totalQuestions) lines.push(`Full paper size: ${p.totalQuestions} questions`);
  if (p.durationMinutes) lines.push(`Duration: ${p.durationMinutes} minutes`);
  if (p.negativeMarkingFraction != null) {
    lines.push(`Negative marking fraction: ${p.negativeMarkingFraction}`);
  }
  if (p.examMode) lines.push(`Mode: ${p.examMode}`);
  if (Array.isArray(p.sections) && p.sections.length) {
    const sec = p.sections.find((s) => s.topicName === topic?.patternSection);
    if (sec) {
      lines.push(
        `This section in official pattern: ${sec.questionCount || "?"} Qs` +
          (sec.marks != null ? `, ${sec.marks} marks` : "")
      );
    }
  }
  if (siblingTopics.length) {
    lines.push(
      `Related topics in same section (do NOT drift into these unless necessary): ${siblingTopics
        .slice(0, 12)
        .map((t) => t.name)
        .join("; ")}`
    );
  }
  if (topic?.weightageSourceLinks?.length) {
    lines.push(
      `Topic source notes (for orientation only, do not invent URLs in answers): ${topic.weightageSourceLinks
        .slice(0, 3)
        .join(" | ")}`
    );
  }
  if (p.officialSyllabusUrl) {
    lines.push(`Official syllabus reference: ${p.officialSyllabusUrl}`);
  }
  lines.push(`Quality focus: ${sectionQualityHint(topic)}`);
  return lines.join("\n");
};

const loadSiblingTopics = async (examId, topic) => {
  if (!topic?.patternSection) return [];
  return topicModel
    .find({
      examId,
      patternSection: topic.patternSection,
      deprecated: false,
      _id: { $ne: topic._id },
    })
    .select("name")
    .sort({ order: 1 })
    .limit(15)
    .lean();
};

const SYSTEM_PROMPT = `You are a senior Rajasthan government exam paper-setter (RSSB / CET / REET style).
Your job is to write ORIGINAL, accurate, exam-ready MCQs.

Quality bar:
- Facts must be correct and commonly accepted in standard Indian competitive-exam materials.
- One clearly correct answer; distractors must be plausible but wrong.
- Match the requested questionType structure exactly.
- Prefer analytical / application items over trivial one-word recall when the type allows.
- Never copy reference examples; use them only for tone, depth, and format.
- Never invent fake laws, fake years, or fake scheme names. If uncertain, use a safer well-known syllabus fact.
- Output ONLY valid JSON as requested.`;

module.exports = {
  formatExamContext,
  loadSiblingTopics,
  sectionQualityHint,
  SYSTEM_PROMPT,
};
