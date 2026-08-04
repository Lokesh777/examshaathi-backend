/**
 * Append contact rows WITHOUT Google OAuth / without Apps Script login.
 *
 * Preferred path: Google Form → linked to your spreadsheet.
 * Anyone can POST to formResponse; Google writes a new sheet row.
 *
 * Env:
 *   GOOGLE_FORM_ACTION_URL=https://docs.google.com/forms/d/e/FORM_ID/formResponse
 *   GOOGLE_FORM_ENTRY_NAME=entry.xxxxxxxx
 *   GOOGLE_FORM_ENTRY_EMAIL=entry.xxxxxxxx
 *   GOOGLE_FORM_ENTRY_CATEGORY=entry.xxxxxxxx
 *   GOOGLE_FORM_ENTRY_SUBJECT=entry.xxxxxxxx
 *   GOOGLE_FORM_ENTRY_MESSAGE=entry.xxxxxxxx
 *   GOOGLE_FORM_ENTRY_SCREENSHOT=entry.xxxxxxxx
 *   GOOGLE_FORM_ENTRY_SOURCE=entry.xxxxxxxx
 *   GOOGLE_FORM_ENTRY_ID=entry.xxxxxxxx
 *   GOOGLE_FORM_ENTRY_TIMESTAMP=entry.xxxxxxxx   (optional)
 *
 * Optional fallback (only if Form is not set):
 *   GOOGLE_SHEETS_WEBHOOK_URL=... Apps Script, access MUST be "Anyone"
 */

const DEFAULT_SHEET_ID = "1UnbN4jcPNKXlnnaYZmXpTyv1jDsv3-csUSrrLSd4-dM";

const HEADERS = [
  "Timestamp",
  "Name",
  "Email",
  "Category",
  "Subject",
  "Message",
  "Screenshot URL",
  "Source",
  "DB Id",
];

const getSpreadsheetId = () =>
  process.env.GOOGLE_SHEETS_CONTACT_ID?.trim() || DEFAULT_SHEET_ID;

const getFormActionUrl = () => process.env.GOOGLE_FORM_ACTION_URL?.trim() || "";
const getWebhookUrl = () => process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim() || "";

const buildPayload = (submission) => {
  const timestamp = submission.createdAt
    ? new Date(submission.createdAt).toISOString()
    : new Date().toISOString();

  return {
    timestamp,
    name: submission.name || "",
    email: submission.email || "",
    category: submission.category || "",
    subject: submission.subject || "",
    message: submission.message || "",
    screenshotUrl: submission.screenshotUrl || "",
    source: submission.source || "",
    id: String(submission._id || ""),
  };
};

const entry = (key) => process.env[key]?.trim() || "";

/**
 * Append via public Google Form (no login, no OAuth).
 * Google Forms accepts anonymous formResponse POSTs.
 */
const appendViaGoogleForm = async (submission) => {
  const actionUrl = getFormActionUrl();
  if (!actionUrl) {
    throw new Error("GOOGLE_FORM_ACTION_URL not set");
  }

  const p = buildPayload(submission);
  const map = [
    [entry("GOOGLE_FORM_ENTRY_TIMESTAMP"), p.timestamp],
    [entry("GOOGLE_FORM_ENTRY_NAME"), p.name],
    [entry("GOOGLE_FORM_ENTRY_EMAIL"), p.email],
    [entry("GOOGLE_FORM_ENTRY_CATEGORY"), p.category],
    [entry("GOOGLE_FORM_ENTRY_SUBJECT"), p.subject],
    [entry("GOOGLE_FORM_ENTRY_MESSAGE"), p.message],
    [entry("GOOGLE_FORM_ENTRY_SCREENSHOT"), p.screenshotUrl],
    [entry("GOOGLE_FORM_ENTRY_SOURCE"), p.source],
    [entry("GOOGLE_FORM_ENTRY_ID"), p.id],
  ].filter(([k]) => k);

  if (map.length < 4) {
    throw new Error(
      "Google Form entry IDs missing. Set GOOGLE_FORM_ENTRY_NAME, _EMAIL, _SUBJECT, _MESSAGE at least."
    );
  }

  const body = new URLSearchParams();
  for (const [key, value] of map) body.append(key, value);

  // Forms often return 200 HTML thank-you, or 302 — both mean success for append
  const res = await fetch(actionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    redirect: "follow",
  });

  // 200 / 302 / even some 4xx with "form" page can still mean submitted;
  // treat network OK + not hard 404/403 as success if status < 500
  if (res.status >= 500) {
    throw new Error(`Google Form submit failed HTTP ${res.status}`);
  }

  return { method: "google-form", spreadsheetId: getSpreadsheetId(), status: res.status };
};

const appendViaWebhook = async (submission) => {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    throw new Error("GOOGLE_SHEETS_WEBHOOK_URL not set");
  }

  const payload = buildPayload(submission);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });

  const text = await res.text();
  // Login redirect HTML = wrong access setting
  if (
    /accounts\.google\.com|Sign in|Page not found|unable to open the file/i.test(
      text
    ) ||
    /accounts\.google\.com/i.test(res.url || "")
  ) {
    throw new Error(
      'Apps Script still asks for login. Redeploy with Who has access = "Anyone", or use Google Form instead (GOOGLE_FORM_ACTION_URL).'
    );
  }

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* ignore */
  }

  if (!res.ok || (data && data.ok === false)) {
    throw new Error((data && data.error) || text.slice(0, 200) || `Webhook HTTP ${res.status}`);
  }

  return {
    method: "webhook",
    spreadsheetId: getSpreadsheetId(),
    response: data || text,
  };
};

/**
 * Prefer Google Form (no login). Fall back to Apps Script webhook.
 */
const appendContactRow = async (submission) => {
  if (getFormActionUrl()) {
    return appendViaGoogleForm(submission);
  }
  if (getWebhookUrl()) {
    return appendViaWebhook(submission);
  }
  throw new Error(
    "No sheet sync configured. Set GOOGLE_FORM_ACTION_URL (recommended) or fix Apps Script access to Anyone."
  );
};

module.exports = {
  appendContactRow,
  getSpreadsheetId,
  getWebhookUrl,
  getFormActionUrl,
  HEADERS,
  DEFAULT_SHEET_ID,
};
