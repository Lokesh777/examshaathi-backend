# Extract saves to MongoDB (`officialPaperCatalog.paperData`) — reuse for publish without re-OCR.

> Product context: [PRODUCT.md](./PRODUCT.md) · Docs index: [README.md](./README.md) · Related: [OLD_PAPER_SERVICE.md](./OLD_PAPER_SERVICE.md)

## Terminal — one paper (always saves DB)

```powershell
cd backend

# Extract + save paperData to MongoDB (no quiz yet)
npm run extract:catalog -- 6a6e3984a884b97d6c221258 ocr

# Extract + save + publish quiz
npm run extract:catalog -- 6a6e3984a884b97d6c221258 ocr --publish
```

Status after extract (no publish): **`extracted`** — `paperData` in DB, ready for other papers / publish later.

## API

- `POST .../sync/extract` body:
  - `{ "catalogId", "provider": "ocr" }` — extract + save + try publish
  - `{ "catalogId", "publishOnly": true }` — publish quiz from saved `paperData` (no re-OCR)

## What works for scanned RSMSSB papers

**Default path:** `Poppler` (page images) → `Tesseract` (hin+eng OCR) → `Groq` (Llama 3.3 structures JSON per page).

One page at a time — safe for full 32-page CET papers (no OOM).

## Terminal — one paper to JSON (no API)

```powershell
cd backend

# Quick test (first 3 pages)
$env:OFFICIAL_PAPER_MAX_PAGES="3"
npm run extract:catalog -- 6a6e3984a884b97d6c221258 ocr

# Full paper (all pages, ~30–60 min)
Remove-Item Env:OFFICIAL_PAPER_MAX_PAGES -ErrorAction SilentlyContinue
npm run extract:catalog -- 6a6e3984a884b97d6c221258 ocr

# Extract + publish quiz in MongoDB
npm run extract:catalog -- 6a6e3984a884b97d6c221258 ocr --publish
```

**Output files:**

- `backend/output/paper_data-<catalogId>.json` — Manus-style quiz JSON
- `backend/output/extract-<catalogId>.json` — full run metadata + attempts

**Example question shape:**

```json
{
  "qNo": 1,
  "questionText": "...",
  "options": ["...", "...", "...", "..."],
  "correctAnswer": "..."
}
```

## Required `.env`

- `MONGODB_URI`
- `GROQ_API_KEY`
- `POPPLER_BIN_PATH` → folder with `pdftoppm.exe` and `pdfinfo.exe`

## Files to review (this pipeline)

| File | Role |
|------|------|
| `src/scripts/extractCatalogToJson.script.js` | CLI: PDF → JSON / `--publish` |
| `src/services/ai/ocrGroq.provider.js` | Page-by-page OCR + Groq |
| `src/services/ai/prompts.js` | Prompts including `buildOcrPageTextPrompt` |
| `src/services/paperExtraction.service.js` | Download PDFs, merge answer key |
| `src/services/paperDataFormatter.service.js` | `paper_data.json` shape |
| `src/services/officialPaperIngestion.service.js` | Publish quiz, saves `paperData` on catalog |
| `src/services/pdfUtils.service.js` | Poppler render, `splitIntoChunks` fix |
| `src/models/officialPaperCatalog.model.js` | `paperData`, `providerAttempts` fields |
| `package.json` | `extract:catalog` npm script |

## UI / API (one paper at a time)

- `POST /api/official-papers/admin/exams/:examId/sync/extract`
  - Body: `{ "catalogId": "...", "provider": "ocr" }`
- Poll: `GET /api/official-papers/admin/sync/:jobId`
- Admin list returns `paperData` after extract

Default provider when omitted: `DEFAULT_EXTRACT_PROVIDER=ocr` in `.env`.

## Flow

1. Phase 1 — store `questionPdfUrl` + `answerKeyPdfUrl` on catalog
2. Phase 2 — OCR one paper → `paperData` JSON on catalog → quiz if match ratio OK
3. Student sees **Solve** when `status: published`
