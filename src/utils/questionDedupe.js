/**
 * Normalize question text for near-duplicate detection.
 * Collapses whitespace/punctuation so "Q ?" and "Q?" match.
 */
const fingerprintQuestionText = (text) => {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u0900-\u097F]/g, (ch) => ch) // keep Devanagari
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
};

/** True if texts are the same or one is a prefix/near-copy of the other. */
const isNearDuplicate = (a, b) => {
  const fa = fingerprintQuestionText(a);
  const fb = fingerprintQuestionText(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  if (fa.length >= 40 && fb.length >= 40) {
    if (fa.includes(fb.slice(0, 80)) || fb.includes(fa.slice(0, 80))) return true;
  }
  return false;
};

const isDuplicateAgainstSet = (text, fingerprints) => {
  const fp = fingerprintQuestionText(text);
  if (!fp) return true;
  if (fingerprints.has(fp)) return true;
  for (const existing of fingerprints) {
    if (existing.length < 30 || fp.length < 30) continue;
    if (fp.includes(existing.slice(0, 60)) || existing.includes(fp.slice(0, 60))) {
      return true;
    }
  }
  return false;
};

/** Soft structural checks so "new pattern" isn't just a labelled direct MCQ. */
const looksLikeQuestionType = (q, type) => {
  const text = `${q.questionText || ""}\n${(q.options || []).join("\n")}`;
  switch (type) {
    case "statement":
      return (
        /(?:^|\n)\s*(?:[1-4१-४][\).\]]|Statement\s*[1-4]|कथन\s*[1-4])/im.test(text) ||
        (q.options || []).some((o) => /केवल|only\s+\d|सभी|all of the above|1\s*(और|and)\s*2/i.test(o || ""))
      );
    case "matching":
      return /List\s*I|List\s*II|सूची\s*[-\s]*I|सूची\s*[-\s]*II|कूट|A\s*[-–:]\s*(i|ii|iii|iv)/i.test(
        text
      );
    case "assertion_reason":
      return /Assertion|Reason|अभिकथन|कारण|\(A\)|\(R\)/i.test(text);
    case "chronology":
      return (
        /कालक्रम|chronolog|correct\s+order|सही\s+क्रम|earliest|latest/i.test(text) ||
        (q.options || []).some((o) => /\d\s*[-–,]\s*\d\s*[-–,]\s*\d/.test(o || ""))
      );
    case "applied_pedagogy":
      return /classroom|teacher|student|शिक्षक|कक्षा|विद्यार्थी|pedagog/i.test(text);
    case "direct":
    default:
      return true;
  }
};

/** Reject low-quality AI output before insert. */
const passesQualityGate = (q, type, optionCount = 4) => {
  if (!q?.questionText || q.questionText.trim().length < 25) return false;
  if (!q?.explanation || q.explanation.trim().length < 20) return false;
  const opts = (q.options || []).map((o) => String(o || "").trim()).filter(Boolean);
  const needed = Math.min(optionCount, 4);
  if (opts.length < needed) return false;

  const uniqueOpts = new Set(opts.map((o) => o.toLowerCase()));
  if (uniqueOpts.size < needed) return false;

  let correct = String(q.correctAnswer || "").trim();
  if (correct.length === 1 && /^[A-E]$/i.test(correct)) {
    const idx = correct.toUpperCase().charCodeAt(0) - 65;
    correct = opts[idx] || "";
  }
  if (!opts.some((o) => o === correct || o.toLowerCase() === correct.toLowerCase())) {
    return false;
  }

  // Too short "direct" recall with almost no content
  if (type === "direct" && q.questionText.trim().length < 40 && !/[?]/.test(q.questionText)) {
    return false;
  }

  return looksLikeQuestionType({ ...q, options: opts, correctAnswer: correct }, type);
};

module.exports = {
  fingerprintQuestionText,
  isNearDuplicate,
  isDuplicateAgainstSet,
  looksLikeQuestionType,
  passesQualityGate,
};
