/**
 * One-time: get a Google refresh token with Sheets write scope.
 *
 * Usage:
 *   1. node src/scripts/getGoogleSheetsRefreshToken.script.js
 *   2. Open the printed URL, sign in as GOOGLE_USER, allow access
 *   3. Paste the code from the redirect URL (?code=...)
 *   4. Copy the new refresh_token into backend/.env as GOOGLE_REFRESH_TOKEN
 *
 * Google Cloud Console → OAuth client must be Desktop or Web with redirect
 * http://localhost:3333/oauth2callback (or the redirect printed below).
 */
require("dotenv").config();
const http = require("http");
const { google } = require("googleapis");
const config = require("../config/config");

const REDIRECT = "http://localhost:3333/oauth2callback";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
];

const oauth2 = new google.auth.OAuth2(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  REDIRECT
);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

console.log("\n1) Add this Authorized redirect URI in Google Cloud Console OAuth client:");
console.log("   ", REDIRECT);
console.log("\n2) Open this URL in the browser (use account:", config.GOOGLE_USER, "):\n");
console.log(authUrl);
console.log("\n3) Waiting for callback on", REDIRECT, "...\n");

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("Missing code");
      return;
    }
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<h2>Success</h2><p>Copy the refresh_token from the terminal into <code>.env</code>, then close this tab.</p>"
    );
    console.log("\n=== TOKENS ===");
    console.log(JSON.stringify(tokens, null, 2));
    if (tokens.refresh_token) {
      console.log("\nSet in .env:\nGOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
    } else {
      console.log(
        "\nNo refresh_token returned. Revoke app access at https://myaccount.google.com/permissions and retry with prompt=consent."
      );
    }
    server.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end(String(err.message));
    process.exit(1);
  }
});

server.listen(3333);
