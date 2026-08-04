/**
 * Seed missing CET 12th syllabus topics (no AI, no duplicates).
 * Usage: node src/scripts/seedCet12SyllabusGaps.script.js [--dry-run]
 */
require("dotenv").config();
const mongoose = require("mongoose");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");

const dryRun = process.argv.includes("--dry-run");

const SECTION = {
  SCIENCE: "General Science (10th standard)",
  RAJ: "Geography, History, Culture, and Polity of Rajasthan",
  LANG: "General English & Hindi",
  REASON: "Mental Ability & Reasoning, Basic Numerical Efficiency",
  COMPUTER: "Basic Computer",
};

/** Granular topics from RSSB CET Sr. Sec. official syllabus areas (Hindi). */
const CANDIDATE_TOPICS = [
  // Rajasthan History / Art / Culture
  { name: "प्राचीन एवं मध्यकालीन राजस्थान का इतिहास", section: SECTION.RAJ },
  { name: "आधुनिक राजस्थान और स्वतंत्रता संग्राम", section: SECTION.RAJ },
  { name: "राजस्थान की कला, वास्तुकला और हस्तकला", section: SECTION.RAJ },
  { name: "राजस्थानी साहित्य और प्रमुख साहित्यकार", section: SECTION.RAJ },
  { name: "राजस्थान के लोक देवता, तीर्थ और मेले-त्योहार", section: SECTION.RAJ },
  { name: "राजस्थान की लोक गीत, लोक नाट्य और लोक कला", section: SECTION.RAJ },

  // Geography India + Rajasthan
  { name: "भारत का भूगोल (स्थिति, जलवायु, नदियाँ)", section: SECTION.RAJ },
  { name: "राजस्थान की जलवायु, मृदा और वनस्पति", section: SECTION.RAJ },
  { name: "राजस्थान की वन्यजीव और संरक्षित क्षेत्र", section: SECTION.RAJ },
  { name: "राजस्थान की खनिज संपदा और उद्योग", section: SECTION.RAJ },

  // Polity
  { name: "भारतीय संविधान की मूल बातें और मौलिक अधिकार", section: SECTION.RAJ },
  { name: "राजस्थान विधानमंडल, राज्यपाल और मुख्यमंत्री", section: SECTION.RAJ },
  { name: "पंचायती राज और स्थानीय स्वशासन (राजस्थान)", section: SECTION.RAJ },

  // Economy Rajasthan
  { name: "राजस्थान की अर्थव्यवस्था और आर्थिक संकेतक", section: SECTION.RAJ },
  { name: "राजस्थान में कृषि, सिंचाई और फसलें", section: SECTION.RAJ },
  { name: "राजस्थान में पर्यटन, उद्योग और सेवा क्षेत्र", section: SECTION.RAJ },

  // Everyday Science
  { name: "मानव शरीर और स्वास्थ्य (Everyday Science)", section: SECTION.SCIENCE },
  { name: "पोषण, रोग और सार्वजनिक स्वास्थ्य", section: SECTION.SCIENCE },
  { name: "भौतिकी के मूल सिद्धांत (10वीं स्तर)", section: SECTION.SCIENCE },
  { name: "रसायन विज्ञान के मूल सिद्धांत (10वीं स्तर)", section: SECTION.SCIENCE },
  { name: "जीव विज्ञान के मूल सिद्धांत (10वीं स्तर)", section: SECTION.SCIENCE },
  { name: "पर्यावरण, पारिस्थितिकी और प्रदूषण", section: SECTION.SCIENCE },

  // Reasoning
  { name: "दिशा और दूरी परीक्षण", section: SECTION.REASON },
  { name: "क्रमबद्धता और वर्गीकरण", section: SECTION.REASON },
  { name: "आंकड़ों की व्याख्या और सारणी", section: SECTION.REASON },
  { name: "प्रतिशत, लाभ-हानि और समय-दूरी", section: SECTION.REASON },

  // Hindi
  { name: "विलोम शब्द और अनेकार्थी शब्द", section: SECTION.LANG },
  { name: "वाक्य अशुद्धि और शुद्ध वर्तनी", section: SECTION.LANG },
  { name: "रस, छंद और अलंकार (मूल)", section: SECTION.LANG },

  // English
  { name: "English Grammar (Tense, Voice, Narration)", section: SECTION.LANG },
  { name: "English Vocabulary and Idioms", section: SECTION.LANG },
  { name: "Reading Comprehension (English)", section: SECTION.LANG },

  // Computer
  { name: "ऑपरेटिंग सिस्टम और फाइल प्रबंधन", section: SECTION.COMPUTER },
  { name: "MS Office (Word, Excel, PowerPoint)", section: SECTION.COMPUTER },
  { name: "ई-गवर्नेंस और डिजिटल भारत", section: SECTION.COMPUTER },

  // Current Affairs — major gap in existing bank
  { name: "समसामयिक घटनाएं (राष्ट्रीय)", section: SECTION.RAJ },
  { name: "समसामयिक घटनाएं (राजस्थान)", section: SECTION.RAJ },
  { name: "खेल, पुरस्कार और महत्वपूर्ण दिवस", section: SECTION.RAJ },
];

const normalizeTopicKey = (s) =>
  (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[।.,;:!?'"()]/g, "");

const isDuplicate = (name, existing) => {
  const key = normalizeTopicKey(name);
  if (!key) return true;
  return existing.some((t) => {
    const ek = normalizeTopicKey(t.name);
    if (ek === key) return true;
    if (ek.length > 8 && key.length > 8 && (ek.includes(key) || key.includes(ek))) return true;
    return false;
  });
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 60000 });
  const exam = await examModel.findOne({ slug: "cet-12th" });
  if (!exam) throw new Error("cet-12th exam not found");

  const existing = await topicModel
    .find({ examId: exam._id, deprecated: false })
    .sort({ order: 1 });

  console.log(`Existing topics: ${existing.length}`);
  console.log(dryRun ? "DRY RUN\n" : "");

  const maxOrder = existing.reduce((m, t) => Math.max(m, t.order || 0), 0);
  let nextOrder = maxOrder + 1;

  const toInsert = [];
  const skipped = [];

  for (const c of CANDIDATE_TOPICS) {
    if (isDuplicate(c.name, existing) || isDuplicate(c.name, toInsert)) {
      skipped.push(c.name);
      continue;
    }
    toInsert.push({
      examId: exam._id,
      name: c.name,
      order: nextOrder++,
      patternSection: c.section,
    });
  }

  console.log(`New topics to add: ${toInsert.length}`);
  console.log(`Skipped (already covered): ${skipped.length}\n`);

  toInsert.forEach((t, i) => console.log(`  + ${i + 1}. ${t.name}`));

  if (!dryRun && toInsert.length) {
    await topicModel.insertMany(toInsert);
    console.log(`\nInserted ${toInsert.length} topics.`);
  }

  const total = await topicModel.countDocuments({ examId: exam._id, deprecated: false });
  console.log(`Total topics: ${total}`);
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
