/**
 * Google Apps Script — paste into YOUR spreadsheet:
 *   https://docs.google.com/spreadsheets/d/1UnbN4jcPNKXlnnaYZmXpTyv1jDsv3-csUSrrLSd4-dM/edit
 *
 * Setup (2 minutes):
 * 1. Open the sheet → Extensions → Apps Script
 * 2. Delete default code, paste THIS entire file
 * 3. Save → Deploy → New deployment
 * 4. Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Deploy → copy the Web app URL
 * 6. Put in backend/.env:
 *      GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/XXXX/exec
 * 7. Restart backend
 *
 * Optional: run function ensureHeaders() once from the Apps Script editor
 * to create the header row.
 */

var SHEET_NAME = "Sheet1"; // change if your tab has another name

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    ensureHeaders_(sheet);

    sheet.appendRow([
      body.timestamp || new Date().toISOString(),
      body.name || "",
      body.email || "",
      body.category || "",
      body.subject || "",
      body.message || "",
      body.screenshotUrl || "",
      body.source || "",
      body.id || "",
    ]);

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/** Allow a quick health check in the browser */
function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, service: "ExamSaathi contact webhook" })
  ).setMimeType(ContentService.MimeType.JSON);
}

function ensureHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  ensureHeaders_(sheet);
}

function ensureHeaders_(sheet) {
  var headers = [
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
  var first = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (!first[0] || first[0] !== "Timestamp") {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}
