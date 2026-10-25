const Groq = require("groq-sdk");

const GROQ_MODELS = {
  primary: process.env.GROQ_MODEL_PRIMARY || "openai/gpt-oss-120b",
  fallback: process.env.GROQ_MODEL_FALLBACK || "llama-3.1-8b-instant",
};

let groqInstance = null;

const getGroqClient = () => {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqInstance) {
    groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqInstance;
};

const groqComplete = async (prompt, options = {}) => {
  const groq = getGroqClient();
  if (!groq) throw new Error("GROQ_API_KEY not configured");

  const { temperature = 0.1, max_tokens = 4096, messages: customMessages } = options;
  const msgs = customMessages || [{ role: "user", content: prompt }];

  const tryModel = async (model) => {
    const completion = await groq.chat.completions.create({
      model,
      messages: msgs,
      temperature,
      max_tokens,
    });
    return completion.choices[0].message.content;
  };

  try {
    return await tryModel(GROQ_MODELS.primary);
  } catch (err) {
    const isRetryable =
      err?.status === 404 ||
      err?.status === 429 ||
      err?.message?.includes("does not exist") ||
      err?.message?.includes("not found");

    if (isRetryable) {
      console.warn(
        `Groq primary model "${GROQ_MODELS.primary}" failed (${err.message}), trying fallback "${GROQ_MODELS.fallback}"`
      );
      return await tryModel(GROQ_MODELS.fallback);
    }
    throw err;
  }
};

const groqChatComplete = async (systemPrompt, userPrompt, options = {}) => {
  return groqComplete(userPrompt, {
    ...options,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
};

module.exports = {
  getGroqClient,
  groqComplete,
  groqChatComplete,
  GROQ_MODELS,
};
