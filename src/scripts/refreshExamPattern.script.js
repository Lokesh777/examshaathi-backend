require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const examSlug = process.argv[2];

if (!examSlug) {
  console.error("Usage: node refreshExamPattern.script.js <examSlug>");
  process.exit(1);
}

const tavilySearch = async (query) => {
  const res = await axios.post("https://api.tavily.com/search", {
    api_key: process.env.TAVILY_API_KEY,
    query,
    search_depth: "advanced",
    max_results: 6,
  });
  return res.data.results;
};

const extractPattern = async (examName, rawText) => {
  const prompt = `
You are extracting the OFFICIAL subject-wise exam pattern (weightage) for "${examName}"
from the raw web text below.

CRITICAL RULES:
- Only extract the subject-level breakdown (subject/section name + number of questions +
  marks) that is presented as OFFICIAL exam pattern — not unofficial topic-wise estimates
  from coaching sites.
- If multiple sources disagree, prefer the one that looks like an official notification
  or is corroborated by multiple sources.
- Do not invent numbers. If total doesn't add up cleanly, still report what the text says.

Return ONLY valid JSON, no markdown:
{
  "totalQuestions": 150,
  "sections": [
    { "topicName": "English Name For Matching", "questionCount": 45, "marks": 90 }
  ]
}

Raw text:
"""
${rawText}
"""
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 2048,
  });

  const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
  return JSON.parse(text);
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("DB connected");

    const exam = await examModel.findOne({ slug: examSlug });
    if (!exam) {
      console.error(`No exam found: ${examSlug}`);
      process.exit(1);
    }

    console.log(`Refreshing pattern for: ${exam.name}`);

    const results = await tavilySearch(
      `${exam.name} official exam pattern subject wise weightage latest questions marks`
    );

    if (results.length === 0) {
      console.warn("No search results found. Pattern not updated.");
      process.exit(0);
    }

    const rawText = results.map((r) => r.content).join("\n\n");
    const links = results.map((r) => r.url);

    const structured = await extractPattern(exam.name, rawText);

    console.log("\n--- EXTRACTED PATTERN ---");
    console.log(JSON.stringify(structured, null, 2));

    exam.pattern = {
      totalQuestions: structured.totalQuestions,
      sections: structured.sections,
      lastRefreshedAt: new Date(),
      sourceLinks: links,
    };
    await exam.save();

    console.log(`\nPattern updated for ${exam.name}. Refreshed at: ${exam.pattern.lastRefreshedAt}`);
    process.exit(0);
  } catch (err) {
    console.error("Script failed:", err.message);
    process.exit(1);
  }
};

run();