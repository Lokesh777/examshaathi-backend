require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const examSlug = process.argv[2];

if (!examSlug) {
  console.error("Usage: node scripts/testSyllabus.js <exam-slug>");
  process.exit(1);
}

const tavilySearch = async (query) => {
  const res = await axios.post("https://api.tavily.com/search", {
    api_key: process.env.TAVILY_API_KEY,
    query,
    search_depth: "advanced",
    max_results: 5,
  });
  return res.data.results.map((r) => r.content).join("\n\n");
};

const extractTopicsWithGroq = async (examName, rawSyllabusText) => {
  const prompt = `
You are given raw web search text about the syllabus and exam pattern for "${examName}".

Extract a GRANULAR, chapter-level list of topics (not broad subject names).
For example, instead of one topic "Geography, History, Culture and Polity of Rajasthan",
break it into separate topics like "Geography of Rajasthan", "History of Rajasthan",
"Culture of Rajasthan", "Polity of Rajasthan" — and further split each into its real
sub-chapters if the source text supports it (e.g. "Rivers of Rajasthan", "Folk Dance of Rajasthan").

Return topic names in HINDI (Devanagari script), even if the source text is in English.

Also extract the exam PATTERN: total questions, sections, marks per section if mentioned.
Keep "topicName" inside pattern.sections in ENGLISH (for internal matching), but the
"topics" array names must be in HINDI.

Return ONLY valid JSON, no markdown, no extra text, in this exact shape:
{
  "topics": [
    { "name": "टॉपिक नाम हिंदी में", "order": 1 }
  ],
  "pattern": {
    "totalQuestions": 120,
    "sections": [
      { "topicName": "English Name For Matching", "questionCount": 40, "marks": 40 }
    ]
  }
}

Raw text:
"""
${rawSyllabusText}
"""
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });

  const text = completion.choices[0].message.content
    .replace(/```json|```/g, "")
    .trim();

  return JSON.parse(text);
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("DB connected");

    const exam = await examModel.findOne({ slug: examSlug });
    if (!exam) {
      console.error(`No exam found with slug: ${examSlug}`);
      process.exit(1);
    }

    const deleted = await topicModel.deleteMany({ examId: exam._id });
    console.log(`Deleted ${deleted.deletedCount} old topics for this exam`);

    exam.syllabusStatus = "fetching";
    await exam.save();
    console.log(`Fetching syllabus for: ${exam.name}`);

    const syllabusText = await tavilySearch(`${exam.name} syllabus topics detailed chapters`);
    const patternText = await tavilySearch(
      `${exam.name} exam pattern previous paper number of questions`
    );
    const combinedText = syllabusText + "\n\n" + patternText;

    const structured = await extractTopicsWithGroq(exam.name, combinedText);

    const topicDocs = structured.topics.map((t) => ({
      examId: exam._id,
      name: t.name,
      order: t.order,
    }));
    await topicModel.insertMany(topicDocs);
    console.log(`Inserted ${topicDocs.length} topics`);

    exam.pattern = structured.pattern;
    exam.syllabusStatus = "ready";
    await exam.save();
    console.log(`Exam updated: syllabusStatus = ready, pattern saved`);

    console.log("\n--- TOPICS SAVED ---");
    topicDocs.forEach((t) => console.log(`${t.order}. ${t.name}`));

    process.exit(0);
  } catch (err) {
    console.error("Script failed:", err.message);
    await examModel.findOneAndUpdate({ slug: examSlug }, { syllabusStatus: "pending" });
    process.exit(1);
  }
};

run();