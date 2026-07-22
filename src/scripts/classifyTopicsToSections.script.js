require("dotenv").config();
const mongoose = require("mongoose");
const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const examSlug = process.argv[2];

if (!examSlug) {
  console.error("Usage: node classifyTopicsToSections.script.js <examSlug>");
  process.exit(1);
}

const classifyTopics = async (examName, sectionNames, topics) => {
  const sectionListText = sectionNames.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const topicListText = topics.map((t, i) => `${i + 1}. ${t.name}`).join("\n");

  const prompt = `
You are classifying granular exam topics for "${examName}" into broad exam-pattern sections.

Broad sections (choose ONLY from this numbered list):
${sectionListText}

Granular topics to classify:
${topicListText}

For EACH granular topic, assign the single best-matching broad section number.

Return ONLY valid JSON, no markdown:
{
  "classifications": [
    { "topicIndex": 1, "sectionIndex": 3 }
  ]
}
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 4096,
  });

  const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
  return JSON.parse(text).classifications;
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
    if (!exam.pattern || !exam.pattern.sections || exam.pattern.sections.length === 0) {
      console.error("Exam has no pattern.sections — run syllabus-fetch script first.");
      process.exit(1);
    }

    const sectionNames = exam.pattern.sections.map((s) => s.topicName);
    console.log(`Pattern sections: ${sectionNames.join(", ")}`);

    const topics = await topicModel.find({ examId: exam._id }).sort({ order: 1 });
    console.log(`Classifying ${topics.length} topics...`);

    const classifications = await classifyTopics(exam.name, sectionNames, topics);

    let updated = 0;
    for (const c of classifications) {
      const topic = topics[c.topicIndex - 1];
      const sectionName = sectionNames[c.sectionIndex - 1];
      if (!topic || !sectionName) continue;

      await topicModel.findByIdAndUpdate(topic._id, { patternSection: sectionName });
      console.log(`${topic.name} → ${sectionName}`);
      updated++;
    }

    console.log(`\nDone. ${updated}/${topics.length} topics classified.`);
    process.exit(0);
  } catch (err) {
    console.error("Script failed:", err.message);
    process.exit(1);
  }
};

run();