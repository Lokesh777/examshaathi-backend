require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const examSlug = process.argv[2];

if (!examSlug) {
  console.error("Usage: node generateSubTopicWeightage.script.js <examSlug>");
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

const extractSubTopics = async (examName, sectionName, sectionQuestionCount, rawText, existingTopics) => {
  const existingListText =
    existingTopics.length > 0
      ? `\n\nThese sub-topics ALREADY EXIST for this section (with their index number):
${existingTopics.map((t, i) => `${i + 1}. ${t.name}`).join("\n")}

For each sub-topic you extract, if it means the SAME thing as one of the above (even if
worded differently, e.g. "मूलभूत अंकगणित" and "बुनियादी अंकगणित" are the same concept),
set "matchesExistingIndex" to that number. If it is genuinely a NEW sub-topic not covered
above, set "matchesExistingIndex" to null.`
      : "";

  const prompt = `
You are analyzing PYQ-based topic-wise weightage estimates for the "${sectionName}" section
of "${examName}", which has ${sectionQuestionCount} total questions.

Extract a granular sub-topic breakdown with estimated question counts, based on the text below.
The counts across all sub-topics should sum to approximately ${sectionQuestionCount}.
${existingListText}

Return topic names in HINDI (Devanagari script).
Return ONLY valid JSON, no markdown:
{
  "subTopics": [
    { "name": "...", "questionCount": 3, "matchesExistingIndex": null }
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
    temperature: 0.2,
    max_tokens: 3000,
  });

  const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
  return JSON.parse(text).subTopics;
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("DB connected");

    const exam = await examModel.findOne({ slug: examSlug });
    if (!exam || !exam.pattern?.sections?.length) {
      console.error("Exam or pattern not found. Run refreshExamPattern script first.");
      process.exit(1);
    }

    for (const section of exam.pattern.sections) {
      console.log(`\n--- Section: ${section.topicName} (${section.questionCount} questions) ---`);

      // load CURRENT topics for this section — this is what makes re-runs idempotent
      const existingTopics = await topicModel.find({
        examId: exam._id,
        patternSection: section.topicName,
        deprecated: false,
      });

      const results = await tavilySearch(
        `${exam.name} ${section.topicName} topic wise weightage previous year questions analysis`
      );

      if (results.length === 0) {
        console.warn(`No results for ${section.topicName}, skipping.`);
        continue;
      }

      const rawText = results.map((r) => r.content).join("\n\n");
      const links = results.map((r) => r.url);

      let subTopics;
      try {
        subTopics = await extractSubTopics(
          exam.name,
          section.topicName,
          section.questionCount,
          rawText,
          existingTopics // ← ab sahi pass ho raha hai
        );
      } catch (err) {
        console.warn(`Extraction failed for ${section.topicName}: ${err.message}`);
        continue;
      }

      if (!subTopics || subTopics.length === 0) {
        console.warn(`No sub-topics extracted for ${section.topicName}.`);
        continue;
      }

      const maxOrderDoc = await topicModel.findOne({ examId: exam._id }).sort({ order: -1 });
      let nextOrder = (maxOrderDoc?.order || 0) + 1;

      for (const st of subTopics) {
        // matched to an existing topic → UPDATE weightage only, keep same _id
        if (st.matchesExistingIndex && existingTopics[st.matchesExistingIndex - 1]) {
          const existing = existingTopics[st.matchesExistingIndex - 1];
          existing.weightage = st.questionCount;
          existing.weightageConfidence = "estimated";
          existing.weightageSourceLinks = links;
          await existing.save();
          console.log(`Updated (matched): ${existing.name} → ${st.questionCount}`);
          continue;
        }

        // genuinely new sub-topic
        await topicModel.create({
          examId: exam._id,
          name: st.name,
          order: nextOrder++,
          patternSection: section.topicName,
          weightage: st.questionCount,
          weightageConfidence: "estimated",
          weightageSourceLinks: links,
        });
        console.log(`Created (new): ${st.name} (${st.questionCount})`);
      }
    }

    const broadTopics = await topicModel.find({
      examId: exam._id,
      weightage: null,
      deprecated: false,
    });
    for (const t of broadTopics) {
      t.deprecated = true;
      await t.save();
      console.log(`Deprecated (superseded): ${t.name}`);
    }

    console.log("\nDone.");
    process.exit(0);
  } catch (err) {
    console.error("Script failed:", err.message);
    process.exit(1);
  }
};

run();