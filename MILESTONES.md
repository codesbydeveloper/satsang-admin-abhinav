# Milestone checklist — admin panel
## M1
- [x] Project setup (Vite + React + router), API client with token handling
- [x] Login: password -> 2FA setup (QR) / 2FA code -> session
- [x] Admin management (Full Admin): list, create, role, deactivate, reset 2FA/password
- [x] User search, user detail, age-group override with reason
- [x] Blocked-words list (Full Admin + Content Editor)
- [x] Audit log viewer with filters
- [x] Role-based menus; 401/403 handling
- [x] Public "Request Account Deletion" page (`/delete-account`, English/Gujarati, no admin login) on live `POST /public/delete-account` (email + password; files a pending request). Gujarati wording to be reviewed by Loyadham
- [x] Dashboard (cards, age-group/registrations/mode/language charts, recent registrations, admin activity, quick actions) on live `GET /admin/dashboard` (not in the M1 list: confirm scope with Loyadham)
- [x] Deletion Requests page (tabs + counts, search, source filter, view panel, approve/reject, sidebar badge, refresh) on live `/admin/deletion-requests` APIs
- [ ] Users: "Add user" popup — built; `createUser` in `src/api/users.js` is a mock until the backend has `POST /admin/users` (not in the M1 list: confirm scope with Loyadham)
- [x] Refresh button + reload on returning to the tab (Users, Deletion requests)
- [x] Whole-panel UI refresh (sidebar with icons, top bar, login, every page; light/dark; tablet drawer)
- [x] User detail: Delete account popup on live `DELETE /admin/users/:accountId` (confirm + reason)
- [ ] User detail: Rename username and Delete child profile popups — designed; need backend endpoints (see `src/api.js` NOT CONNECTED YET)
- [ ] Verified by Abhinav and merged
