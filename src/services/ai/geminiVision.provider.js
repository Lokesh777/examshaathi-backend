const { GoogleGenerativeAI } = require("@google/generative-ai");
const { buildPageExtractionPrompt, buildAnswerKeyPrompt, buildImageCropMcqPrompt } = require("./prompts");

const parseJsonFromText = (text) => {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
};

const extractWithGeminiKey = async (apiKey, modelName, prompt, imageBuffer) => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const parts = [{ text: prompt }];
  if (imageBuffer) {
    parts.push({
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType: "image/png",
      },
    });
  }

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
  });

  const text = result.response.text();
  return parseJsonFromText(text);
};

const extractQuestionsFromPage = async (examName, topicListText, imageBuffer) => {
  const prompt = buildPageExtractionPrompt(examName, topicListText);
  const modelName = process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash";

  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_FALLBACK,
  ].filter(Boolean);

  if (keys.length === 0) {
    throw new Error("No GEMINI_API_KEY configured");
  }

  let lastErr;
  for (const key of keys) {
    try {
      const result = await extractWithGeminiKey(key, modelName, prompt, imageBuffer);
      return result.questions || [];
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Gemini vision failed");
};

const extractAnswerKeyFromText = async (examName, text) => {
  const prompt = buildAnswerKeyPrompt(examName, text);
  const modelName = process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash";

  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_FALLBACK,
  ].filter(Boolean);

  if (keys.length === 0) {
    throw new Error("No GEMINI_API_KEY configured");
  }

  let lastErr;
  for (const key of keys) {
    try {
      const result = await extractWithGeminiKey(key, modelName, prompt, null);
      return result.answers || {};
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Gemini answer key extraction failed");
};

const extractMcqFromCropImage = async (examName, topicListText, qNo, imageBuffer) => {
  const prompt = buildImageCropMcqPrompt(examName, topicListText, qNo);
  const modelName = process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash";

  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_FALLBACK,
  ].filter(Boolean);

  if (keys.length === 0) {
    throw new Error("No GEMINI_API_KEY configured");
  }

  let lastErr;
  for (const key of keys) {
    try {
      return await extractWithGeminiKey(key, modelName, prompt, imageBuffer);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Gemini crop vision failed");
};

const isAvailable = () =>
  Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_FALLBACK);

module.exports = {
  name: "gemini",
  isAvailable,
  extractQuestionsFromPage,
  extractAnswerKeyFromText,
  extractMcqFromCropImage,
};
