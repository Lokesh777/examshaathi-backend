const OpenAI = require("openai");
const { buildPageExtractionPrompt, buildAnswerKeyPrompt } = require("./prompts");

const parseJsonFromText = (text) => {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
};

const getClient = () => {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

const extractQuestionsFromPage = async (examName, topicListText, imageBuffer) => {
  const client = getClient();
  if (!client) throw new Error("OPENAI_API_KEY not configured");

  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const prompt = buildPageExtractionPrompt(examName, topicListText);

  const content = [
    { type: "text", text: prompt },
    {
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${imageBuffer.toString("base64")}`,
      },
    },
  ];

  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content }],
    temperature: 0.1,
    max_tokens: 4096,
  });

  const text = res.choices[0]?.message?.content || "";
  const result = parseJsonFromText(text);
  return result.questions || [];
};

const extractAnswerKeyFromText = async (examName, text) => {
  const client = getClient();
  if (!client) throw new Error("OPENAI_API_KEY not configured");

  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const prompt = buildAnswerKeyPrompt(examName, text);

  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 4096,
  });

  const textOut = res.choices[0]?.message?.content || "";
  const result = parseJsonFromText(textOut);
  return result.answers || {};
};

const isAvailable = () => Boolean(process.env.OPENAI_API_KEY?.trim());

module.exports = {
  name: "openai",
  isAvailable,
  extractQuestionsFromPage,
  extractAnswerKeyFromText,
};
