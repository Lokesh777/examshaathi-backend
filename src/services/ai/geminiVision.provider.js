const { GoogleGenAI } = require("@google/genai");
const { buildPageExtractionPrompt, buildAnswerKeyPrompt, buildImageCropMcqPrompt } = require("./prompts");

const parseJsonFromText = (text) => {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
};

// Extraction doesn't need deep reasoning. Gemini 2.5 takes a token budget
// (0 = off); Gemini 3+ takes a level and rejects "minimal" on Flash.
const thinkingConfigFor = (modelName) =>
  /^gemini-2\./.test(modelName)
    ? { thinkingBudget: 0 }
    : { thinkingLevel: "low" };

const extractWithGeminiKey = async (apiKey, modelName, prompt, imageBuffer) => {
  // Fail fast when the model is overloaded so the next key/provider is tried
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: Number(process.env.GEMINI_TIMEOUT_MS) || 90000 },
  });

  const parts = [{ text: prompt }];
  if (imageBuffer) {
    parts.push({
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType: "image/png",
      },
    });
  }

  const result = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: "user", parts }],
    config: {
      temperature: 0.1,
      // Headroom for thinking tokens, which count against this budget
      maxOutputTokens: 8192,
      thinkingConfig: thinkingConfigFor(modelName),
    },
  });

  return parseJsonFromText(result.text || "");
};

const extractQuestionsFromPage = async (examName, topicListText, imageBuffer) => {
  const prompt = buildPageExtractionPrompt(examName, topicListText);
  const modelName = process.env.GEMINI_VISION_MODEL || "gemini-3.8-flash";

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
  const modelName = process.env.GEMINI_VISION_MODEL || "gemini-3.8-flash";

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
  const modelName = process.env.GEMINI_VISION_MODEL || "gemini-3.8-flash";

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
