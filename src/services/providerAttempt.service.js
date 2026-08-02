const officialPaperCatalogModel = require("../models/officialPaperCatalog.model");
const { getProviderMeta } = require("./ai/providerMeta");

const recordProviderAttempt = async (catalogId, attempt) => {
  if (!catalogId) return;
  const entry = {
    provider: attempt.provider,
    model: attempt.model || getProviderMeta(attempt.provider).model,
    stage: attempt.stage,
    success: attempt.success,
    error: attempt.error || null,
    questionCount: attempt.questionCount || 0,
    at: new Date(),
  };
  await officialPaperCatalogModel.updateOne(
    { _id: catalogId },
    {
      $push: {
        providerAttempts: {
          $each: [entry],
          $slice: -40,
        },
      },
    }
  );
};

const clearProviderAttempts = async (catalogId) => {
  if (!catalogId) return;
  await officialPaperCatalogModel.updateOne({ _id: catalogId }, { providerAttempts: [] });
};

module.exports = {
  recordProviderAttempt,
  clearProviderAttempts,
};
