const axios = require("axios");
const cheerio = require("cheerio");
const { legacyHttpsAgent } = require("./pdfUtils.service");

const QP_ARCHIVE_URL =
  process.env.RSMSSB_QP_ARCHIVE_URL ||
  "https://rsmssb.rajasthan.gov.in/show_archived?menuName=Xj4lCb9vGxpQnfLs/xlZ2g==";

const AK_ARCHIVE_URL =
  process.env.RSMSSB_AK_ARCHIVE_URL ||
  "https://rsmssb.rajasthan.gov.in/show_archived?menuName=AGDAnN3xlANlxQ9BZvzaeg==";

const DOWNLOAD_BASE = "https://rsmssb.rajasthan.gov.in/download_file?downloadFileId=";

const fetchHtml = async (url) => {
  const res = await axios.get(url, {
    httpsAgent: legacyHttpsAgent,
    timeout: 60000,
    headers: { "User-Agent": "Mozilla/5.0 ExamSaathi/1.0" },
  });
  return res.data;
};

const extractDownloadLinks = (html) => {
  const $ = cheerio.load(html);
  const items = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const onclick = $(el).attr("onclick") || "";
    const title = $(el).text().replace(/\s+/g, " ").trim();

    let fileId = null;
    const hrefMatch = href.match(/downloadFileId=(\d+)/i);
    const onclickMatch = onclick.match(/downloadFileId[=:'"]+(\d+)/i);
    if (hrefMatch) fileId = hrefMatch[1];
    if (onclickMatch) fileId = onclickMatch[1];

    if (!fileId || !title) return;

    items.push({
      title,
      downloadFileId: fileId,
      url: `${DOWNLOAD_BASE}${fileId}`,
    });
  });

  return items;
};

const normalizeTitle = (title) => title.toLowerCase().replace(/\s+/g, " ").trim();

const extractYear = (title) => {
  const m = title.match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
};

const extractSetCode = (title) => {
  const patterns = [
    /paper\s+([A-Z]?\d+[A-Z]?)/i,
    /set[-\s]*(\d+)/i,
    /\b([A-Z]\d{2,3})\b/,
    /\b(\d{3})\s*[A-F]\b/i,
    /paper\s+(\d+\s*[A-D])\b/i,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return m[1].replace(/\s+/g, "").toUpperCase();
  }
  const tail = title.match(/([A-Z]\d{2,3}|[A-Z]{1,2}\d{1,3})$/i);
  return tail ? tail[1].toUpperCase() : "";
};

const classifyExamSlug = (title) => {
  const t = normalizeTitle(title);
  if (
    t.includes("cet (graduation level)") ||
    t.includes("cet graduation") ||
    (t.includes("graduation level") && t.includes("cet"))
  ) {
    return "cet-graduation";
  }
  if (
    t.includes("cet (sr. sec.)") ||
    t.includes("cet (sr.sec)") ||
    t.includes("sr. sec. level") ||
    t.includes("senior secondary") ||
    (t.includes("sr. sec") && t.includes("cet"))
  ) {
    return "cet-12th";
  }
  return null;
};

const isQuestionPaperTitle = (title) => {
  const t = normalizeTitle(title);
  if (t.includes("answer key") || t.includes("answerkey") || t.includes("ans key")) {
    return false;
  }
  return (
    t.includes("question paper") ||
    t.includes("master question paper") ||
    (t.includes("cet") && !t.includes("answer"))
  );
};

const isAnswerKeyTitle = (title) => {
  const t = normalizeTitle(title);
  return (
    t.includes("answer key") ||
    t.includes("answerkey") ||
    t.includes("ans key") ||
    t.includes("ans. key")
  );
};

const pairPapers = (questionPapers, answerKeys, examSlug) => {
  const pairs = [];

  for (const qp of questionPapers) {
    if (classifyExamSlug(qp.title) !== examSlug) continue;

    const year = extractYear(qp.title);
    const setCode = extractSetCode(qp.title);
    if (!year) continue;

    let bestAk = null;
    let bestScore = 0;

    for (const ak of answerKeys) {
      if (!isAnswerKeyTitle(ak.title)) continue;
      const akYear = extractYear(ak.title);
      if (akYear && akYear !== year) continue;

      const akSet = extractSetCode(ak.title);
      const t = normalizeTitle(ak.title);
      let score = 0;
      if (akSet && setCode && akSet === setCode) score += 10;
      if (t.includes("cet") && examSlug.includes("cet")) score += 2;
      if (examSlug === "cet-12th" && (t.includes("sr. sec") || t.includes("senior secondary"))) score += 5;
      if (examSlug === "cet-graduation" && t.includes("graduation")) score += 5;
      if (setCode && t.includes(setCode.toLowerCase())) score += 3;

      if (score > bestScore) {
        bestScore = score;
        bestAk = ak;
      }
    }

    if (bestAk && bestScore >= 5) {
      pairs.push({
        rsmssbTitle: qp.title,
        year,
        setCode,
        questionDownloadFileId: qp.downloadFileId,
        answerKeyDownloadFileId: bestAk.downloadFileId,
        questionPdfUrl: qp.url,
        answerKeyPdfUrl: bestAk.url,
      });
    }
  }

  return pairs;
};

/**
 * Step 1 — fetch both archive pages and extract every download URL (no pairing yet).
 */
const fetchAllArchiveUrls = async () => {
  const [qpHtml, akHtml] = await Promise.all([
    fetchHtml(QP_ARCHIVE_URL),
    fetchHtml(AK_ARCHIVE_URL),
  ]);

  const qpLinks = extractDownloadLinks(qpHtml).filter((l) => isQuestionPaperTitle(l.title));
  const akLinks = extractDownloadLinks(akHtml);

  return { qpLinks, akLinks };
};

/**
 * Step 2 — pair question papers with answer keys for one exam slug (in memory, no network).
 */
const buildPaperPairsForExam = (examSlug, qpLinks, akLinks) => {
  return pairPapers(qpLinks, akLinks, examSlug);
};

/**
 * Full discovery: all URLs first, then paired list for the exam.
 */
const discoverPaperPairsForExam = async (examSlug) => {
  const { qpLinks, akLinks } = await fetchAllArchiveUrls();
  const pairs = buildPaperPairsForExam(examSlug, qpLinks, akLinks);
  return { qpLinks, akLinks, pairs };
};

/** Legacy helper — same as discover but returns pairs only. */
const scrapeCatalogForExam = async (examSlug) => {
  const { pairs } = await discoverPaperPairsForExam(examSlug);
  return pairs;
};

module.exports = {
  fetchAllArchiveUrls,
  buildPaperPairsForExam,
  discoverPaperPairsForExam,
  scrapeCatalogForExam,
  classifyExamSlug,
  QP_ARCHIVE_URL,
  AK_ARCHIVE_URL,
};
