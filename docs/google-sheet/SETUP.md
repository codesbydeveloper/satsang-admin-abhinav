# Live Users sheet – setup (about 10 minutes)

This Google Sheet shows the same list as the **Users** page in the Admin Panel. It refreshes by itself **every hour**. You can also refresh it any time with the menu **Satsang Spark → Refresh now**.

The sheet contains private information (names, emails, dates of birth, including children's). Only the people who need it should have access.

## What you need

- A Google account (the sheet will belong to it).
- Two values from the Satsang Spark developer (send them privately, never by group chat or email to many people):
  - **EXPORT_URL**: the export address, for example `https://satsang-api.raomtech.com/api/v1/export/sheet`
  - **EXPORT_KEY**: a long secret key (at least 48 characters)
- The file **Code.gs** (it is next to this guide).

## Steps

1. **Create the sheet.** Go to [sheets.google.com](https://sheets.google.com) and make a new blank spreadsheet. Name it, for example, "Satsang Spark – Users".
2. **Set the time zone.** In the sheet, click **File → Settings**. Set **Time zone** to **(GMT+05:30) India Standard Time – Kolkata** and click **Save settings**. ("Joined" dates then show in Indian time.)
3. **Open Apps Script.** Click **Extensions → Apps Script**. A new tab opens with a file called `Code.gs` that has a few lines in it.
4. **Paste the script.** Delete everything in that file. Open **Code.gs** from this folder, copy all of it, and paste it in. Click the **Save** icon (the floppy disk) at the top.
5. **Add the two values.** On the left, click the **gear icon (Project Settings)**. Scroll down to **Script Properties** and click **Add script property**:
   - Property: `EXPORT_URL`, Value: the address you were given
   - Click **Add script property** again. Property: `EXPORT_KEY`, Value: the secret key you were given

   Click **Save script properties**. (The key is stored here only, never inside the script.)
6. **Run setup.** On the left, click the **< > (Editor)** icon. At the top, in the box next to **Run**, choose **setup**, then click **Run**.
7. **Allow permissions.** Google asks for permission the first time:
   - Click **Review permissions** and choose your Google account.
   - If you see "Google hasn't verified this app", click **Advanced**, then **Go to (project name) (unsafe)**. This is your own script, so this is expected.
   - Click **Allow**. The script asks to: see and edit this spreadsheet, connect to an external service (the Satsang Spark server), and run on a schedule.
8. **Check it worked.** Go back to the sheet tab. You should see:
   - a **Users** tab with the list (coloured header row, families together, child rows shaded and starting with "↳ ", parent accounts highlighted)
   - an **Info** tab with "Last updated: … (Asia/Kolkata)", the number of rows and "Last error: none".
9. **Reload the sheet** (press F5). The menu **Satsang Spark → Refresh now** appears.

That's it. The sheet now updates by itself every hour. Running **setup** again later is safe: it never creates a second hourly refresh.

## Keep the sheet private

- Click **Share** (top right). Under **General access**, it must say **Restricted** ("Only people with access can open with the link"). Never choose "Anyone with the link".
- Add only the people who need the list, by their email. Give **Viewer** access unless someone really needs to edit.
- Do not share the EXPORT_KEY. Anyone who has it can download the list.

## If something goes wrong

Look at the **Info** tab, line "Last error". The old data stays in the Users tab until a refresh works again.

| Last error says | What to do |
| --- | --- |
| Set EXPORT_URL and EXPORT_KEY… | Step 5 was missed or a name is misspelt. The names must be exactly `EXPORT_URL` and `EXPORT_KEY`. |
| The server refused the key (401) | The key is wrong or was changed. Ask the developer for the current key and update it in Script Properties. |
| Export not found (404) | The address is wrong, or the export is switched off on the server. Ask the developer. |
| Too many refreshes this hour (429) | "Refresh now" was clicked too often. Wait; the next hourly refresh will work. |

**To stop the hourly refresh:** in Apps Script, click the **clock icon (Triggers)** on the left, and delete the `syncUsers` trigger.

**If the key leaks:** ask the developer to change SHEET_EXPORT_KEY on the server, then put the new key in Script Properties (step 5) and choose **Refresh now**.

## For the developer

- Server setting: `SHEET_EXPORT_KEY` (48+ random characters, e.g. `openssl rand -hex 32`). Empty = the export is off (404).
- Endpoint: `GET /api/v1/export/sheet` with header `X-Export-Key`. 30 requests per hour per IP, no CORS, audited as `sheet.export` (row count only). Details in the backend's `/api-docs`.
