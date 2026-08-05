# Launch checklist — ExamSaathi

Use this the night before / morning of launch.

## 1. Backend (Render)

Set `NODE_ENV=production` and verify these env vars are present (see `.env.example`):

| Required | Why |
|----------|-----|
| `MONGODB_URI` | Database |
| `JWT_SECRET` | Auth tokens |
| `GROQ_API_KEY` | Tutor + generation |
| `CLIENT_URL` / `CLIENT_URLS` | CORS for your Vercel domain(s) |
| `BREVO_API_KEY`, `SENDER_*`, Google OAuth mail vars | OTP / password email |
| `PORT` | Render sets this automatically |

Optional but recommended for contact inbox sync:

- `GOOGLE_FORM_ACTION_URL` + entry IDs — see [../src/scripts/GOOGLE_FORM_SHEET_SETUP.md](../src/scripts/GOOGLE_FORM_SHEET_SETUP.md)
- Or `GOOGLE_SHEETS_WEBHOOK_URL` (Apps Script, access = Anyone)

After deploy:

- [ ] `GET https://<api-host>/health` → `{ ok: true }`
- [ ] `POST https://<api-host>/api/contact` accepts anonymous submissions (no login)
- [ ] Swagger `/api-docs` is **off** unless `ENABLE_SWAGGER=true` on Render (then redeploy)
- [ ] If contact/login return **403 Origin not allowed**, add your Vercel URL to `CLIENT_URLS` or redeploy latest backend (allows `*.vercel.app` previews)
- [ ] Login from the live frontend sets refresh cookie (needs `Secure` + `SameSite=None`)

## 2. Frontend (Vercel)

| Env | Value |
|-----|--------|
| `NEXT_PUBLIC_API_BASE_URL` | `https://examshaathi-backend.onrender.com/api` (or your API URL) |

- [ ] Production build succeeds (`npm run build`)
- [ ] Landing `/`, Privacy `/privacy`, Terms `/terms` load
- [ ] Register → verify email → login works
- [ ] Topics: daily streak + open a topic quiz
- [ ] AI Tutor answers in Hindi/English without source links
- [ ] Generate 10 questions on one topic (shared bank)
- [ ] Contact form submits

If you add a custom domain, add it to backend `CLIENT_URLS` and update `robots.ts` / `sitemap.ts` base URL.

## 3. Product smoke (15 min)

1. New user signup + OTP
2. Daily streak start
3. Topic generate (Normal) + create practice quiz + submit
4. AI Tutor 2 questions (Hindi topic + English topic)
5. Open a mock or old paper if published
6. Logout / refresh / stay logged in

## 4. Ops notes

- Render free tier sleeps — first request after idle may be slow; consider paid if launch traffic matters.
- Groq rate limits — generate/chat are rate-limited on API.
- Do not commit `.env` / `.env.local`.
- Admin: promote your user `role: "admin"` in Mongo for Old Papers sync / inbox.

## Related docs

- [PRODUCT.md](./PRODUCT.md)
- [OLD_PAPER_SERVICE.md](./OLD_PAPER_SERVICE.md)
- [Contact form setup](../src/scripts/GOOGLE_FORM_SHEET_SETUP.md)
