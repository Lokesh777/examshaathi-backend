const mongoose = require("mongoose"); // top pe, ek hi baar
const attemptModel = require("../models/attempt.model");

const getQuizLeaderboard = async (quizId, userId) => {
  const quizObjectId = new mongoose.Types.ObjectId(quizId); // ab sahi

  const topAttempts = await attemptModel.aggregate([
    { $match: { quizId: quizObjectId } },
    { $sort: { scorePercent: -1, timeTakenSeconds: 1 } },
    {
      $group: {
        _id: "$userId",
        bestAttempt: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$bestAttempt" } },
    { $sort: { scorePercent: -1, timeTakenSeconds: 1 } },
    { $limit: 50 },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        userId: 1,
        name: "$user.name",
        score: 1,
        totalQuestions: 1,
        scorePercent: 1,
        timeTakenSeconds: 1,
      },
    },
  ]);

  const allRanked = await attemptModel.aggregate([
    { $match: { quizId: quizObjectId } },
    { $sort: { scorePercent: -1, timeTakenSeconds: 1 } },
    {
      $group: {
        _id: "$userId",
        bestAttempt: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$bestAttempt" } },
    { $sort: { scorePercent: -1, timeTakenSeconds: 1 } },
  ]);

  const myIndex = allRanked.findIndex((a) => a.userId.toString() === userId.toString());
  const myRank = myIndex === -1 ? null : myIndex + 1;
  const myAttempt = myIndex === -1 ? null : allRanked[myIndex];

  return {
    top50: topAttempts,
    totalParticipants: allRanked.length,
    myRank,
    myAttempt,
  };
};

module.exports = { getQuizLeaderboard };