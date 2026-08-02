const buildPageExtractionPrompt = (examName, topicListText) =>
  `You are extracting REAL MCQ questions from an official previous-year exam paper page for "${examName}".

Valid topics (choose topicNumber from this list only):
${topicListText}

RULES:
- Extract EVERY complete MCQ visible on this page with original question number (qNo).
- CET papers often have 4–6 questions per page — do not skip any readable question.
- Do NOT invent questions or options.
- Exactly 4 options per question, order A,B,C,D.
- Hindi Devanagari for text; Arabic numerals for numbers.
- Skip incomplete or unreadable questions.

Return ONLY valid JSON:
{
  "questions": [
    { "qNo": 1, "questionText": "...", "options": ["...","...","...","..."], "topicNumber": 1 }
  ]
}`;

const buildAnswerKeyPrompt = (examName, text) =>
  `Extract answer key mapping for "${examName}" official paper.
Return ONLY JSON: { "answers": { "1": "B", "2": "D", "150": "A" } }
Map every question number in the text to A/B/C/D. Include high numbers (e.g. 101–150).
Only confident A/B/C/D entries. Skip ambiguous.

Text:
"""
${text.slice(0, 14000)}
"""`;

const buildChunkExtractionPrompt = (examName, topicListText, chunkText, isOcr = false) => {
  const ocrNote = isOcr
    ? "Text may have OCR errors — fix obvious typos only, skip garbled content."
    : "ONLY extract questions literally present in the text.";

  return `You are extracting REAL exam questions from an official previous-year question paper for "${examName}".

Topics:
${topicListText}

TASK:
- Extract every COMPLETE MCQ with original question number (qNo).
- Choose single best topicNumber from the list.
- ${ocrNote}
- Exactly 4 options, preserve A,B,C,D order.
- Hindi Devanagari; Arabic numerals.

Return ONLY valid JSON:
{
  "questions": [
    { "qNo": 23, "questionText": "...", "options": ["...","...","...","..."], "topicNumber": 7 }
  ]
}

Text:
"""
${chunkText}
"""`;
};

const buildOcrPageTextPrompt = (examName, topicListText, pageText) =>
  `${buildPageExtractionPrompt(examName, topicListText)}

This is OCR text from ONE page of the question paper (may contain typos):
"""
${pageText.slice(0, 8000)}
"""`;

const buildImageCropMcqPrompt = (examName, topicListText, qNo) =>
  `You are reading a CROPPED region from an official "${examName}" previous-year paper showing question number ${qNo}.

Valid topics (topicNumber from list only):
${topicListText}

Return ONLY valid JSON:
{
  "describable": true or false,
  "imageOptions": true if options A-D are pictures/diagrams not readable text,
  "questionText": "Hindi stem — describe diagram in words if needed",
  "options": ["opt1","opt2","opt3","opt4"] OR ["A","B","C","D"] when imageOptions is true,
  "topicNumber": 1
}

Rules:
- describable=true when you can produce a fair text MCQ (4 text options).
- describable=false when the question REQUIRES seeing a diagram/figure (geometry, map, graph).
- Do NOT invent content not visible in the image.
- Hindi Devanagari for text.`;

module.exports = {
  buildPageExtractionPrompt,
  buildAnswerKeyPrompt,
  buildChunkExtractionPrompt,
  buildOcrPageTextPrompt,
  buildImageCropMcqPrompt,
};
