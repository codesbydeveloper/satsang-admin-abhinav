# Milestone checklist — admin panel
## M1
- [x] Project setup (Vite + React + router), API client with token handling
- [x] Login: password -> 6-digit code sent by email (resend with 60s countdown) -> session (authenticator app removed 20 Nov 2026)
- [x] Admin management (Full Admin): invite by email (name, email, role), status Active / Invited (expiry) / Inactive, resend or cancel invite, change role, deactivate / reactivate, emergency password reset; own row protected (20 Nov 2026)
- [x] Public `/accept-invite?token=…` page: shows the invite, set password (12+ chars), invalid / expired screens
- [x] User search, user detail, age-group override with reason
- [x] Blocked-words list (Full Admin + Content Editor)
- [x] Audit log viewer with filters
- [x] Role-based menus; 401/403 handling
- [x] Public "Request Account Deletion" page (`/delete-account`, English/Gujarati, no admin login) on live `POST /public/delete-account` (email + password; files a pending request). Gujarati wording to be reviewed by Loyadham
- [x] Dashboard (cards, age-group/registrations/mode/language charts, recent registrations, admin activity, quick actions) on live `GET /admin/dashboard` (not in the M1 list: confirm scope with Loyadham)
- [x] Deletion Requests page (tabs + counts, search, source filter, view panel, approve/reject, sidebar badge, refresh) on live `/admin/deletion-requests` APIs
- [x] Deletion request drawer (19 Nov 2026): retained email with a "Kept until <date> – then erased automatically for privacy." note; "— (erased)" after that date, "— (account deleted)" when none was kept; timestamps from the backend are ISO UTC and shown in local time (fixes Requested vs Handled 5h30 apart)
- [x] Users page is view only: "Add user" removed (client: app accounts are created only in the app)
- [x] Refresh button + reload on returning to the tab (Users, Deletion requests)
- [x] Whole-panel UI refresh (sidebar with icons, top bar, login, every page; light/dark; tablet drawer)
- [x] User detail: Delete account popup on live `DELETE /admin/users/:accountId` (confirm + reason)
- [x] User detail: owner's first name, last name and gender (private; from backend branch `m1/signup-fields`, "—" for older accounts)
- [x] Referrals page (Full Admin only, client change 30 Oct 2026): the four referral settings (new user Sparks, referrer Sparks, window hours, max per referrer / unlimited), saved with the audit log, and the referrals list (code, referrer and referee usernames, status, dates); hidden from Content Editors (backend `m1/client-30oct`)
- [x] Trusted devices + Remember me (client change 23 Nov 2026, backend Part F1): password-only sign-in on a trusted browser (device token kept after logout, forgotten on deviceTokenInvalid); Remember me (default on) keeps the session 30 days with automatic token refresh, off = this browser session only; My account → Trusted devices (list/remove); Admins → Devices per admin; "Full Admins: used/max" and the FULL_ADMIN_LIMIT message on invite / change role
- [ ] User detail: Rename username popup — designed; needs a backend endpoint (see `src/api.js` NOT CONNECTED YET)
- [x] Deleting profiles + completed deletions (Parts D+E, client 23 Nov 2026; backend same day): "Delete this child profile" (Full Admin; shows the child username, "Only this child is deleted…", type the username; `DELETE /admin/users/profiles/:id`) and, on a parent, a separate "Delete parent account and all child profiles" (parent email, "This will delete N child profiles: …", type the email); Deletion requests → Completed has separate Username and Email columns (retained 30 days, Full Admin), child entries with "Parent email", "Details removed" + request #id after the period, search by username / email / #ID, source "Admin Panel"; "Loyadham Online Satsang Classes" wording everywhere
- [x] Users table (Part B, client 23 Nov 2026; backend same day): one row per playable profile grouped by account (children indented under their parent with "↳ child"; a parent shown only for a matching child is greyed); columns Name, Username, Account type, Country, DOB, Age group, Email (child rows: "Parent email" in grey), Class status, Joined, View; click a header to sort (arrow); toolbar search (name/username/email) + Country, Age group, Account type, Class Status (All / Verified Students / Pending Verification / Interested / Not Enrolled), all kept in the URL, Clear; old ?studentStatus= links mapped (dashboard "pending + interested" kept); table scrolls sideways on narrow screens
- [x] Export to CSV + live Google Sheet (Part G, client 24 Nov 2026; backend same day): "Export to CSV" on Users (Full Admin) downloads every row for the current search, filters and sort (backend `GET /admin/users/export.csv`); `docs/google-sheet/Code.gs` (Apps Script: hourly sync of a "Users" sheet from `/api/v1/export/sheet`, Script Properties EXPORT_URL / EXPORT_KEY, "Info" sheet, menu Satsang Spark → Refresh now) and `docs/google-sheet/SETUP.md` (steps for Loyadham)
- [ ] Verified by Abhinav and merged

## M2
- [x] Sparks in the Admin Panel (chunk 2.2B; backend chunk 2.1 `/admin/profiles/:id/sparks*`, `/admin/sparks/config`): User detail shows per playable profile (own profile and each child separately) the Sparks balance, lifetime earned, lifetime spent, pending and a paged "Sparks history" (type, amount, status, date, admin + reason for adjustments; admin names from the Admins list, else "Admin #id")
- [x] "Adjust Sparks" (Full Admin): amount (+ adds / − deducts) and required reason (3–255), confirm step with balance before → after, one transactionId per confirmed attempt (safe retry), toast with the new balance; below zero blocked in the form and the server's INSUFFICIENT_SPARKS (balance / needed) shown in the dialog
- [x] Sparks settings page (Full Admin, sidebar → Administration): reward per activity (Quiz, Game, Puzzle, Learn) and age group, editable table (0–10,000, changed cells highlighted, "default" tag), Save → confirm with every from → to, sends only the changed rows; note "Values to be confirmed by Loyadham"
- [x] "Reserved" Sparks wording replaced by the real balance (student verify / confirm interest, child delete, Referrals hints)
- [ ] Users table "Sparks" column (balance, sortable): built in the panel (`row.sparksBalance`, `sort=sparks`), **needs the backend** `GET /admin/users` to return `sparksBalance` per row and accept `sort=sparks` (not in backend chunk 2.1)
