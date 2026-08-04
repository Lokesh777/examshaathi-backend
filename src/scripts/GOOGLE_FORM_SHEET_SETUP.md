# Google Sheet sync WITHOUT login / OAuth
# =====================================
# Apps Script "Anyone" often still asks for login on some accounts.
# Use a Google Form linked to your sheet instead — formResponse is public.
#
# SETUP (about 3 minutes)
# ----------------------
# 1. Open your sheet:
#    https://docs.google.com/spreadsheets/d/1UnbN4jcPNKXlnnaYZmXpTyv1jDsv3-csUSrrLSd4-dM/edit
#
# 2. Tools → Create a new form  (or Insert → Form)
#
# 3. Add Short answer / Paragraph questions IN THIS ORDER (exact titles help):
#    - Timestamp
#    - Name
#    - Email
#    - Category
#    - Subject
#    - Message
#    - Screenshot URL
#    - Source
#    - DB Id
#
# 4. Click Send → </> (embed) or open the live form link.
#    Form URL looks like:
#    https://docs.google.com/forms/d/e/1FAIpQL................/viewform
#
# 5. Change /viewform → /formResponse for the action URL:
#    https://docs.google.com/forms/d/e/1FAIpQL................/formResponse
#
# 6. Get entry IDs (easiest way):
#    a. Open the live form
#    b. Right‑click → View page source (or Inspect)
#    c. Search for name="entry.   — you will see entry.1234567890 for each field
#    d. Map each field to the matching env var below
#
#    OR use this bookmarklet trick in form tab console:
#    [...document.querySelectorAll('[name^="entry."]')]
#      .map(i => i.name + ' = ' + (i.closest('[role="listitem"],.Qr7Oae')?.innerText||'').slice(0,40))
#
# 7. Put values in backend/.env, restart backend, submit a test contact form.
#
# Responses land in the Form responses tab of your spreadsheet automatically.

GOOGLE_FORM_ACTION_URL=
GOOGLE_FORM_ENTRY_TIMESTAMP=
GOOGLE_FORM_ENTRY_NAME=
GOOGLE_FORM_ENTRY_EMAIL=
GOOGLE_FORM_ENTRY_CATEGORY=
GOOGLE_FORM_ENTRY_SUBJECT=
GOOGLE_FORM_ENTRY_MESSAGE=
GOOGLE_FORM_ENTRY_SCREENSHOT=
GOOGLE_FORM_ENTRY_SOURCE=
GOOGLE_FORM_ENTRY_ID=
