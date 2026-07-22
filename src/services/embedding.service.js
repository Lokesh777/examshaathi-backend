const axios = require("axios");

const JINA_API_URL = "https://api.jina.ai/v1/embeddings";

const getEmbedding = async (text) => {
  const res = await axios.post(
    JINA_API_URL,
    {
      model: "jina-embeddings-v3",
      task: "text-matching",
      dimensions: 512, // ← match Atlas index ka 512
      input: [text],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  return res.data.data[0].embedding;
};

module.exports = { getEmbedding };