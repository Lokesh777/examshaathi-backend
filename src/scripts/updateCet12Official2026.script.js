/**
 * Apply official CET 12th Level (2026) exam pattern + syllabus topics to DB.
 * Merge-only for topics — no deletes, no duplicates.
 *
 * Usage: node src/scripts/updateCet12Official2026.script.js [--dry-run]
 */
require("dotenv").config();
const mongoose = require("mongoose");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");

const dryRun = process.argv.includes("--dry-run");

const OFFICIAL_SYLLABUS_URL =
  "https://drive.google.com/file/d/1TgJfNh270iTsFsf87VpkGnXSyue9ey-V/view";

/** 13 official subjects from RSSB notification — 120 Q total (10+10+10+9×10). */
const OFFICIAL_SECTIONS = [
  { topicName: "राजस्थान का इतिहास", questionCount: 10, marks: 20 },
  { topicName: "राजस्थान की कला और संस्कृति", questionCount: 10, marks: 20 },
  { topicName: "भारत का भूगोल", questionCount: 10, marks: 20 },
  { topicName: "राजस्थान का भूगोल", questionCount: 9, marks: 18 },
  {
    topicName: "राजस्थान के विशेष संदर्भ में भारतीय राजनीतिक व्यवस्था",
    questionCount: 9,
    marks: 18,
  },
  { topicName: "राजस्थान की अर्थव्यवस्था", questionCount: 9, marks: 18 },
  { topicName: "सामान्य विज्ञान", questionCount: 9, marks: 18 },
  { topicName: "तर्कशक्ति और गणित", questionCount: 9, marks: 18 },
  { topicName: "समसामयिक मामले", questionCount: 9, marks: 18 },
  { topicName: "जन स्वास्थ्य", questionCount: 9, marks: 18 },
  { topicName: "कंप्यूटर का बुनियादी ज्ञान", questionCount: 9, marks: 18 },
  { topicName: "सामान्य हिंदी", questionCount: 9, marks: 18 },
  { topicName: "सामान्य अंग्रेजी", questionCount: 9, marks: 18 },
];

/** Granular subtopics from official syllabus PDF (merge-only). */
const OFFICIAL_TOPICS = [
  // 1. History
  { name: "प्राचीन सभ्यताएं और पुरातात्विक स्थल (राजस्थान)", section: "राजस्थान का इतिहास" },
  { name: "प्रमुख शासक और उनकी उपलब्धियां", section: "राजस्थान का इतिहास" },
  { name: "1857 की क्रांति (राजस्थान)", section: "राजस्थान का इतिहास" },
  { name: "किसान आंदोलन, जनजातीय आंदोलन और प्रजा मंडल", section: "राजस्थान का इतिहास" },
  { name: "राजस्थान का एकीकरण", section: "राजस्थान का इतिहास" },
  { name: "प्रमुख ऐतिहासिक व्यक्तित्व (राजस्थान)", section: "राजस्थान का इतिहास" },

  // 2. Art & Culture
  { name: "राजस्थान की वास्तुकला और चित्रकला", section: "राजस्थान की कला और संस्कृति" },
  { name: "लोक संगीत, वाद्ययंत्र, नृत्य और नाट्य", section: "राजस्थान की कला और संस्कृति" },
  { name: "प्रमुख धार्मिक संप्रदाय और लोक देवता", section: "राजस्थान की कला और संस्कृति" },
  { name: "पोशाक, आभूषण, मेले-त्योहार और रीति-रिवाज", section: "राजस्थान की कला और संस्कृति" },
  { name: "भाषा, बोलियां और साहित्य (राजस्थान)", section: "राजस्थान की कला और संस्कृति" },
  { name: "कला-संस्कृति के प्रमुख व्यक्तित्व", section: "राजस्थान की कला और संस्कृति" },

  // 3. India Geography
  { name: "भारत की भौतिक विशेषताएं (पर्वत, पठार, मरुस्थल, मैदान)", section: "भारत का भूगोल" },
  { name: "प्रमुख नदियां, बांध, झीलें और महासागर (भारत)", section: "भारत का भूगोल" },
  { name: "वन्यजीव और अभयारण्य (भारत)", section: "भारत का भूगोल" },
  { name: "आपदा प्रबंधन और जलवायु परिवर्तन", section: "भारत का भूगोल" },

  // 4. Rajasthan Geography
  { name: "राजस्थान की प्रमुख भौतिक विशेषताएं", section: "राजस्थान का भूगोल" },
  { name: "राजस्थान की जलवायु, वनस्पति और मृदा", section: "राजस्थान का भूगोल" },
  { name: "राजस्थान की नदियां, बांध और झीलें", section: "राजस्थान का भूगोल" },
  { name: "राजस्थान के प्राकृतिक संसाधन (खनिज, वन, जल)", section: "राजस्थान का भूगोल" },
  { name: "पशुधन, वन्यजीव और संरक्षण (राजस्थान)", section: "राजस्थान का भूगोल" },
  { name: "जनसंख्या वितरण, वृद्धि, साक्षरता और लिंगानुपात (राजस्थान)", section: "राजस्थान का भूगोल" },
  { name: "राजस्थान की प्रमुख जनजातियां", section: "राजस्थान का भूगोल" },
  { name: "राजस्थान में पर्यटन", section: "राजस्थान का भूगोल" },

  // 5. Polity
  { name: "संविधान, प्रस्तावना, मौलिक अधिकार और नीति निदेशक तत्व", section: "राजस्थान के विशेष संदर्भ में भारतीय राजनीतिक व्यवस्था" },
  { name: "राष्ट्रपति, प्रधानमंत्री, संसद, सर्वोच्च न्यायालय और चुनाव आयोग", section: "राजस्थान के विशेष संदर्भ में भारतीय राजनीतिक व्यवस्था" },
  { name: "राजस्थान: राज्यपाल, मुख्यमंत्री, विधानसभा और उच्च न्यायालय", section: "राजस्थान के विशेष संदर्भ में भारतीय राजनीतिक व्यवस्था" },
  { name: "RPSC, राज्य चुनाव आयोग और जानकारी आयोग (राजस्थान)", section: "राजस्थान के विशेष संदर्भ में भारतीय राजनीतिक व्यवस्था" },
  { name: "पंचायती राज और स्थानीय स्वशासन", section: "राजस्थान के विशेष संदर्भ में भारतीय राजनीतिक व्यवस्था" },

  // 6. Economy
  { name: "उद्योग, कृषि, पशुपालन और खनिज क्षेत्र (राजस्थान)", section: "राजस्थान की अर्थव्यवस्था" },
  { name: "राज्य आय, बजट और अर्थव्यवस्था की विशेषताएं", section: "राजस्थान की अर्थव्यवस्था" },
  { name: "हस्तशिल्प, बेरोजगारी, सूखा और अकाल (राजस्थान)", section: "राजस्थान की अर्थव्यवस्था" },
  { name: "कल्याणकारी योजनाएं और विकास संस्थान (राजस्थान)", section: "राजस्थान की अर्थव्यवस्था" },
  { name: "MGNREGA और VB-G RAM G", section: "राजस्थान की अर्थव्यवस्था" },

  // 7. Science
  { name: "भौतिक और रासायनिक परिवर्तन, ऑक्सीकरण-अपचयन", section: "सामान्य विज्ञान" },
  { name: "धातु, अधातु और दैनिक जीवन के यौगिक", section: "सामान्य विज्ञान" },
  { name: "कार्बन, हाइड्रोकार्बन, पॉलिमर और साबुन-डिटर्जेंट", section: "सामान्य विज्ञान" },
  { name: "प्रकाश का परावर्तन, लेंस और दृष्टि दोष", section: "सामान्य विज्ञान" },
  { name: "अंतरिक्ष और भारत का अंतरिक्ष कार्यक्रम", section: "सामान्य विज्ञान" },
  { name: "आनुवंशिकी, मेंडल के नियम और न्यूक्लिक अम्ल", section: "सामान्य विज्ञान" },
  { name: "पारिस्थितिकी तंत्र और जैव-भू-रासायनिक चक्र", section: "सामान्य विज्ञान" },
  { name: "जैव प्रौद्योगिकी और आर्थिक महत्व के जीव", section: "सामान्य विज्ञान" },
  { name: "रक्त समूह, रोग और पोषण", section: "सामान्य विज्ञान" },

  // 8. Reasoning & Math
  { name: "रक्त संबंध (Blood Relation)", section: "तर्कशक्ति और गणित" },
  { name: "संख्या श्रृंखला और वर्णमाला श्रृंखला", section: "तर्कशक्ति और गणित" },
  { name: "घड़ी और कैलेंडर", section: "तर्कशक्ति और गणित" },
  { name: "LCM, HCF, औसत, लाभ-हानि, प्रतिशत और ब्याज", section: "तर्कशक्ति और गणित" },
  { name: "समय, दूरी, कार्य और क्षेत्रफल-आयतन", section: "तर्कशक्ति और गणित" },
  { name: "आंकड़ों का चित्रण (ग्राफ, बार, पाई चार्ट)", section: "तर्कशक्ति और गणित" },
  { name: "कोड-डिकोड और बैठक व्यवस्था", section: "तर्कशक्ति और गणित" },
  { name: "मानसिक योग्यता और विश्लेषणात्मक क्षमता", section: "तर्कशक्ति और गणित" },

  // 9. Current Affairs
  { name: "राष्ट्रीय समसामयिक (राजनीति, अर्थव्यवस्था, खेल)", section: "समसामयिक मामले" },
  { name: "राजस्थान समसामयिक", section: "समसामयिक मामले" },
  { name: "राज्य और राष्ट्रीय योजनाएं-नीतियां", section: "समसामयिक मामले" },
  { name: "मौलिक कर्तव्य और नैतिक मूल्य", section: "समसामयिक मामले" },
  { name: "राजस्थान लोक परीक्षा अधिनियम 2022 (अनुचित साधन)", section: "समसामयिक मामले" },

  // 10. Public Health
  { name: "प्राथमिक चिकित्सा और CPR", section: "जन स्वास्थ्य" },
  { name: "नशीली दवाओं का दुरुपयोग और रोकथाम", section: "जन स्वास्थ्य" },
  { name: "युवाओं का शारीरिक और मानसिक स्वास्थ्य", section: "जन स्वास्थ्य" },
  { name: "सोशल मीडिया की लत और स्वास्थ्य जोखिम", section: "जन स्वास्थ्य" },

  // 11. Computer
  { name: "कंप्यूटर की विशेषताएं और अनुप्रयोग", section: "कंप्यूटर का बुनियादी ज्ञान" },
  { name: "कंप्यूटर संगठन, मेमोरी और I/O उपकरण", section: "कंप्यूटर का बुनियादी ज्ञान" },
  { name: "MS Office (Word, Excel, PowerPoint)", section: "कंप्यूटर का बुनियादी ज्ञान" },

  // 12. Hindi
  { name: "संज्ञा, सर्वनाम, विशेषण, अव्यय, क्रिया", section: "सामान्य हिंदी" },
  { name: "सन्धि और संधि विच्छेद", section: "सामान्य हिंदी" },
  { name: "समास और समास-विग्रह", section: "सामान्य हिंदी" },
  { name: "उपसर्ग और प्रत्यय", section: "सामान्य हिंदी" },
  { name: "पर्यायवाची, विलोम, अनेकार्थक और शब्द-युग्म", section: "सामान्य हिंदी" },
  { name: "शब्द शुद्धि और वाक्य शुद्धि", section: "सामान्य हिंदी" },
  { name: "मुहावरे और लोकोक्तियां", section: "सामान्य हिंदी" },
  { name: "कार्यालयी पत्र और प्रशासनिक शब्दावली (हिंदी)", section: "सामान्य हिंदी" },

  // 13. English
  { name: "English Tenses and Voice", section: "सामान्य अंग्रेजी" },
  { name: "Narration, Articles and Prepositions", section: "सामान्य अंग्रेजी" },
  { name: "Hindi-English Translation (Simple Sentences)", section: "सामान्य अंग्रेजी" },
  { name: "Synonyms, Antonyms and One Word Substitution", section: "सामान्य अंग्रेजी" },
  { name: "Reading Comprehension (English)", section: "सामान्य अंग्रेजी" },
  { name: "Official Letter Writing (English)", section: "सामान्य अंग्रेजी" },
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

/** Keyword rules to reclassify existing topics into official sections. */
const classifyTopic = (topic) => {
  const n = topic.name;
  const old = normalizeTopicKey(topic.patternSection || "");

  if (/english|comprehension|tense|voice|narration|synonym|antonym|vocabulary|idiom|letter writing|जनरल इंग्लिश/i.test(n)) {
    return "सामान्य अंग्रेजी";
  }

  if (/समसामयिक|current affair|खेल|पुरस्कार|महत्वपूर्ण दिवस|सरकारी योजनाएं|राजनीति एवं योजनाएं|राजस्थान की राजनीति/i.test(n)) {
    return "समसामयिक मामले";
  }

  if (/cpr|जन स्वास्थ्य|नशीली|सोशल मीडिया|मानसिक स्वास्थ्य|प्राथमिक चिकित्सा/i.test(n)) {
    return "जन स्वास्थ्य";
  }

  if (/blood relation|ब्लड|दिशा|क्रम|आंकड|प्रतिशत|लाभ|घड़ी|calendar|कोड|बैठक|श्रृंखला|तार्किक|reasoning|mental ability|numerical|गणित|मानसिक|सादृश्यता|सीरीज|विश्लेषण|संख्या|सरलीकरण|रेखा और आकार/i.test(n)) {
    return "तर्कशक्ति और गणित";
  }

  if (/computer|ms office|ऑपरेटिंग|ई-गवर्नेंस|डिजिटल भारत|कंप्यूटर|हार्डवेयर|सॉफ्टवेयर|नेटवर्क|डेटाबेस|साइबर|इंटरनेट/i.test(n)) {
    return "कंप्यूटर का बुनियादी ज्ञान";
  }

  if (/भौतिक|रसायन|जीव विज्ञान|जीवन|विज्ञान|science|पर्यावरण|पोषण|रोग|ecosystem|biotech|physics|chemistry|biology|जेनेटिक|आनुवंशिक|धातु|अधातु|दैनिक विज्ञान|मानव शरीर|मानव स्वास्थ्य/i.test(n)) {
    return "सामान्य विज्ञान";
  }

  if (/इतिहास|1857|एकीकरण|प्रजा मंडल|स्वतंत्रता|शासक|ऐतिहासिक/i.test(n)) {
    return "राजस्थान का इतिहास";
  }

  if (/कला|संस्कृति|साहित्य|लोक गीत|लोक नाट्य|हस्तकला|वास्तु|चित्र|मेले|त्योहार|लोक देवता|नृत्य/i.test(n)) {
    return "राजस्थान की कला और संस्कृति";
  }

  if (/अर्थव्यवस्था|कृषि|उद्योग|खनिज|mgnrega|बजट|हस्तशिल्प|बेरोजगारी|जिला और कृषि/i.test(n)) {
    return "राजस्थान की अर्थव्यवस्था";
  }

  if (/संविधान|राजनीतिक|polity|विधान|राज्यपाल|मुख्यमंत्री|पंचायती|चुनाव|governor|parliament/i.test(n)) {
    return "राजस्थान के विशेष संदर्भ में भारतीय राजनीतिक व्यवस्था";
  }

  if (/भारत का भूगोल|भारत की|भारत में|\(भारत\)|india.*geograph|disaster|climate change|आपदा प्रबंधन/i.test(n) && !/राजस्थान/i.test(n)) {
    return "भारत का भूगोल";
  }

  if (/प्रजामंडल|प्रजा मंडल/i.test(n)) {
    return "राजस्थान का इतिहास";
  }

  if (/अंतरिक्ष|space research/i.test(n)) {
    return "सामान्य विज्ञान";
  }

  if (/जनसंख्या|भौतिक विशेषताएं/i.test(n) && /राजस्थान/i.test(n)) {
    return "राजस्थान का भूगोल";
  }

  if (/राजस्थान.*भूगोल|जलवायु|मृदा|वनस्पति|जनजाति|पर्यटन|वन्यजीव|नदी|झील|भूगोल/i.test(n)) {
    return "राजस्थान का भूगोल";
  }

  if (/हिंदी|हिन्दी|संधि|समास|विलोम|मुहावर|वाक्य|वर्तनी|छंद|अलंकार|शब्द|उपसर्ग|प्रत्यय|कार्यालयी|पर्यायवाची|व्याकरण/i.test(n)) {
    return "सामान्य हिंदी";
  }

  if (old.includes("english")) return "सामान्य अंग्रेजी";
  if (old.includes("hindi") || old.includes("english & hindi")) {
    return /english/i.test(n) ? "सामान्य अंग्रेजी" : "सामान्य हिंदी";
  }
  if (old.includes("computer")) return "कंप्यूटर का बुनियादी ज्ञान";
  if (old.includes("reasoning") || old.includes("mental ability")) return "तर्कशक्ति और गणित";
  if (old.includes("science")) return "सामान्य विज्ञान";
  if (old.includes("geography") || old.includes("history") || old.includes("culture") || old.includes("polity")) {
    if (/भारत/i.test(n) && !/राजस्थान/i.test(n)) return "भारत का भूगोल";
    if (/इतिहास|1857|एकीकरण/i.test(n)) return "राजस्थान का इतिहास";
    if (/कला|संस्कृति|साहित्य|लोक/i.test(n)) return "राजस्थान की कला और संस्कृति";
    if (/अर्थ|कृषि|उद्योग/i.test(n)) return "राजस्थान की अर्थव्यवस्था";
    if (/संविधान|राजनीति|पंचायत/i.test(n)) {
      return "राजस्थान के विशेष संदर्भ में भारतीय राजनीतिक व्यवस्था";
    }
    return "राजस्थान का भूगोल";
  }

  return topic.patternSection || OFFICIAL_SECTIONS[0].topicName;
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 60000 });

  const exam = await examModel.findOne({ slug: "cet-12th" });
  if (!exam) throw new Error("cet-12th exam not found");

  console.log(dryRun ? "=== DRY RUN ===\n" : "");

  const patternUpdate = {
    totalQuestions: 120,
    totalMarks: 240,
    marksPerQuestion: 2,
    durationMinutes: 150,
    passingMarksPercent: 40,
    examMode: "Offline",
    negativeMarkingFraction: 1 / 3,
    sections: OFFICIAL_SECTIONS,
    lastRefreshedAt: new Date(),
    officialSyllabusUrl: OFFICIAL_SYLLABUS_URL,
    sourceLinks: [OFFICIAL_SYLLABUS_URL],
  };

  const questionProfileUpdate = {
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
  };

  console.log("Exam pattern update:");
  console.log(`  ${patternUpdate.totalQuestions} Q · ${patternUpdate.totalMarks} marks · ${patternUpdate.durationMinutes} min`);
  console.log(`  Passing: ${patternUpdate.passingMarksPercent}% · Negative: 1/3 · Mode: ${patternUpdate.examMode}`);
  console.log(`  Sections: ${patternUpdate.sections.length}`);
  console.log(`  Syllabus: ${OFFICIAL_SYLLABUS_URL}\n`);

  if (!dryRun) {
    exam.name = "Common Eligibility Test (CET) 12th Level";
    exam.pattern = patternUpdate;
    exam.questionProfile = questionProfileUpdate;
    exam.syllabusStatus = "ready";
    await exam.save();
    console.log("Exam document updated.\n");
  }

  const existing = await topicModel
    .find({ examId: exam._id, deprecated: false })
    .sort({ order: 1 });

  console.log(`Existing topics: ${existing.length}`);

  const maxOrder = existing.reduce((m, t) => Math.max(m, t.order || 0), 0);
  let nextOrder = maxOrder + 1;
  const pool = [...existing];
  const toInsert = [];

  for (const c of OFFICIAL_TOPICS) {
    if (isDuplicate(c.name, pool) || isDuplicate(c.name, toInsert)) continue;
    toInsert.push({
      examId: exam._id,
      name: c.name,
      order: nextOrder++,
      patternSection: c.section,
      weightageConfidence: "official",
      weightageSourceLinks: [OFFICIAL_SYLLABUS_URL],
    });
  }

  console.log(`New official subtopics to add: ${toInsert.length}`);
  if (!dryRun && toInsert.length) {
    await topicModel.insertMany(toInsert);
  }

  let reclassified = 0;
  const officialSectionNames = new Set(OFFICIAL_SECTIONS.map((s) => s.topicName));
  const allTopics = await topicModel.find({ examId: exam._id, deprecated: false });
  for (const topic of allTopics) {
    const newSection = classifyTopic(topic);
    if (
      newSection &&
      newSection !== topic.patternSection &&
      !(officialSectionNames.has(topic.patternSection) && topic.weightageConfidence === "official")
    ) {
      console.log(`  Reclassify: ${topic.name} → ${newSection}`);
      if (!dryRun) {
        await topicModel.findByIdAndUpdate(topic._id, { patternSection: newSection });
      }
      reclassified++;
    }
  }

  const total = await topicModel.countDocuments({ examId: exam._id, deprecated: false });
  console.log(`\nReclassified: ${reclassified} topics`);
  console.log(`Total topics now: ${total}`);

  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
