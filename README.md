# Satsang Spark — Admin Panel (Milestone 1)

React (Vite) panel for the Satsang Spark backend: admin login with a 6-digit code sent by email, admin management, user search with age-group override, blocked words, and the audit log. Full Admin sees everything; Content Editor sees blocked words only.

## Run
```bash
npm install
npm run dev        # http://localhost:5173 — backend address is set in src/config.js (local or live)
npm test           # 5 tests
npm run build      # static files in dist/
```
Start the backend first and create the first admin with `npm run seed:admin` there. For production uncomment the live `API_BASE_URL` in `src/config.js`, and add the panel's address to the backend's `CORS_ORIGINS`.

## Notes
- The admin token is kept in `sessionStorage` (cleared when the tab closes) and sent as a Bearer header.
- Not verified yet against a live backend in a browser; the tests mock the API. Content sections (questions, Dress Up, etc.) arrive with Milestones 2–4.
