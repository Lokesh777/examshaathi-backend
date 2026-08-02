const axios = require("axios");
const { buildPageExtractionPrompt, buildAnswerKeyPrompt } = require("./prompts");

const parseJsonFromText = (text) => {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
};

const getBaseUrl = () =>
  (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");

const getModel = () => process.env.OLLAMA_VISION_MODEL || "gemma4:e4b";

const isAvailable = async () => {
  try {
    const base = getBaseUrl();
    const res = await axios.get(`${base}/api/tags`, { timeout: 3000 });
    const models = res.data?.models || [];
    const wanted = getModel();
    return models.some((m) => m.name === wanted || m.name?.startsWith(wanted.split(":")[0]));
  } catch {
    return false;
  }
};

const ollamaGenerate = async (prompt, imageBuffer) => {
  const base = getBaseUrl();
  const payload = {
    model: getModel(),
    prompt,
    stream: false,
    options: { temperature: 0.1 },
  };
  if (imageBuffer) {
    payload.images = [imageBuffer.toString("base64")];
  }

  const res = await axios.post(`${base}/api/generate`, payload, {
    timeout: 300000,
  });
  return res.data?.response || "";
};

const extractQuestionsFromPage = async (examName, topicListText, imageBuffer) => {
  const prompt = buildPageExtractionPrompt(examName, topicListText);
  const text = await ollamaGenerate(prompt, imageBuffer);
  const result = parseJsonFromText(text);
  return result.questions || [];
};

const extractAnswerKeyFromText = async (examName, text) => {
  const prompt = buildAnswerKeyPrompt(examName, text);
  const out = await ollamaGenerate(prompt, null);
  const result = parseJsonFromText(out);
  return result.answers || {};
};

module.exports = {
  name: "ollama",
  isAvailable,
  extractQuestionsFromPage,
  extractAnswerKeyFromText,
};
