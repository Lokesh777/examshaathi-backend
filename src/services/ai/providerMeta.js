const PROVIDER_META = {
  openai: {
    label: "OpenAI",
    model: () => process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
  },
  gemini: {
    label: "Google Gemini",
    model: () => process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash",
  },
  ollama: {
    label: "Ollama (local)",
    model: () => process.env.OLLAMA_VISION_MODEL || "gemma4:e4b",
  },
  ocr: {
    label: "Groq + Tesseract OCR",
    model: () => process.env.GROQ_VISION_MODEL || "llama-3.3-70b-versatile",
  },
  "pdf-parse": {
    label: "Groq (embedded PDF text)",
    model: () => process.env.GROQ_VISION_MODEL || "llama-3.3-70b-versatile",
  },
  "admin-import": {
    label: "Admin JSON import",
    model: () => "manual",
  },
};

const getProviderMeta = (name) => {
  const entry = PROVIDER_META[name];
  if (!entry) return { label: name, model: "unknown" };
  return { label: entry.label, model: entry.model() };
};

const formatProviderLabel = (name) => {
  const { label, model } = getProviderMeta(name);
  return `${label} · ${model}`;
};

module.exports = {
  getProviderMeta,
  formatProviderLabel,
  PROVIDER_META,
};
