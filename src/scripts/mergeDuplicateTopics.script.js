// mergeDuplicateTopics.script.js	➕ Add karo (one-time cleanup)	Jo duplicates already ban chuke hain, unhe safely merge karega
// scripts/mergeDuplicateTopics.script.js (one-time cleanup, jo abhi ban chuke duplicates ke liye)

require("dotenv").config();
const mongoose = require("mongoose");
const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");
const questionModel = require("../models/question.model");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const examSlug = process.argv[2];

if (!examSlug) {
  console.error("Usage: node mergeDuplicateTopics.script.js <examSlug>");
  process.exit(1);
}

const findDuplicateGroups = async (sectionName, topics) => {
  const topicListText = topics
    .map((t, i) => `${i + 1}. ${t.name} (weightage: ${t.weightage}, id: ${t._id})`)
    .join("\n");

  const prompt = `
Below is a list of sub-topics for the "${sectionName}" exam section. Some of these are
DUPLICATES of each other — same concept, different wording (e.g. "मूलभूत अंकगणित" and
"बुनियादी अंकगणित" are the same thing).

${topicListText}

Group any duplicates together. For each group of 2+ duplicates, pick the BEST/clearest name
as canonical (canonicalIndex), and list the other index numbers as duplicates to merge into it.
Topics that have no duplicate should NOT appear in the output at all.

Return ONLY valid JSON, no markdown:
{
  "duplicateGroups": [
    { "canonicalIndex": 3, "duplicateIndexes": [7, 12] }
  ]
}
`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 2048,
  });

const text = completion.choices[0].message.content
  .replace(/```json|```/g, "")
  .trim();

// extra safety: extract just the {...} block in case Groq adds stray text
const jsonMatch = text.match(/\{[\s\S]*\}/);
const cleanText = jsonMatch ? jsonMatch[0] : text;

return JSON.parse(cleanText).duplicateGroups;
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

    for (const section of exam.pattern.sections) {
      const topics = await topicModel.find({
        examId: exam._id,
        patternSection: section.topicName,
        deprecated: false,
      });

      if (topics.length < 2) continue;

      console.log(`\n--- Checking section: ${section.topicName} (${topics.length} topics) ---`);

      let groups;
      try {
        groups = await findDuplicateGroups(section.topicName, topics);
      } catch (err) {
        console.warn(`Duplicate detection failed: ${err.message}`);
        continue;
      }

      if (!groups || groups.length === 0) {
        console.log(`No duplicates found.`);
        continue;
      }

      for (const group of groups) {
        const canonical = topics[group.canonicalIndex - 1];
        if (!canonical) continue;

        let mergedWeightage = canonical.weightage || 0;

        for (const dupIdx of group.duplicateIndexes) {
          const dup = topics[dupIdx - 1];
          if (!dup) continue;

          console.log(`Merging "${dup.name}" (${dup.weightage}) → "${canonical.name}"`);

          // safety: if any questions were already generated under the duplicate
          // topicId, re-point them to the canonical topic instead of losing them
          const movedCount = await questionModel.updateMany(
            { topicId: dup._id },
            { $set: { topicId: canonical._id } }
          );
          if (movedCount.modifiedCount > 0) {
            console.log(`  Moved ${movedCount.modifiedCount} question(s) to canonical topic`);
          }

          mergedWeightage += dup.weightage || 0;

          await topicModel.findByIdAndDelete(dup._id);
        }

        canonical.weightage = mergedWeightage;
        await canonical.save();
        console.log(`Canonical "${canonical.name}" final weightage: ${mergedWeightage}`);
      }
    }

    console.log("\nMerge complete. Run verifyTopicWeightage.script.js to confirm totals now match.");
    process.exit(0);
  } catch (err) {
    console.error("Script failed:", err.message);
    process.exit(1);
  }
};

run();