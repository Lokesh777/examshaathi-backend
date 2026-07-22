require("dotenv").config();
const mongoose = require("mongoose");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");

const examSlug = process.argv[2];

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const exam = await examModel.findOne({ slug: examSlug });

  for (const section of exam.pattern.sections) {
    const topics = await topicModel.find({
      examId: exam._id,
      patternSection: section.topicName,
      deprecated: false,
      weightage: { $ne: null },
    });

    const total = topics.reduce((sum, t) => sum + t.weightage, 0);
    const status = total === section.questionCount ? "OK" : "MISMATCH";

    console.log(`\n[${status}] ${section.topicName}: expected ${section.questionCount}, got ${total}`);
    topics.forEach((t) => console.log(`  - ${t.name} (${t.weightage}) [${t._id}]`));
  }

  process.exit(0);
};

run();

// node src/scripts/verifyTopicWeightage.script.js cet-12th