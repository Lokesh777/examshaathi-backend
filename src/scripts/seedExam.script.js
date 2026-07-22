require("dotenv").config();
const mongoose = require("mongoose");
const examModel = require("../models/exam.model");

const defaultExams = [
  { name: "CET Graduation Level", slug: "cet-graduation" },
  { name: "CET 12th Level", slug: "cet-12th" },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("DB connected");

    for (const exam of defaultExams) {
      const exists = await examModel.findOne({ slug: exam.slug });
      if (exists) {
        console.log(`Skipped (already exists): ${exam.slug}`);
        continue;
      }
      await examModel.create(exam);
      console.log(`Inserted: ${exam.slug}`);
    }

    console.log("Seeding done");
    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
};

seed();