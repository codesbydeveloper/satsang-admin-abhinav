# Satsang Spark — Admin Panel (Milestone 1)

React (Vite) panel for the Satsang Spark backend: admin login with authenticator-app 2FA, admin management, user search with age-group override, blocked words, and the audit log. Full Admin sees everything; Content Editor sees blocked words only.

## Run
```bash
npm install
npm run dev        # http://localhost:5173 — forwards /api to the backend on http://localhost:3000
npm test           # 5 tests
npm run build      # static files in dist/
```
Start the backend first and create the first admin with `npm run seed:admin` there. For production set `VITE_API_BASE` (see `.env.example`) to the API address, and add the panel's address to the backend's `CORS_ORIGINS`.

## Notes
- The admin token is kept in `sessionStorage` (cleared when the tab closes) and sent as a Bearer header.
- Not verified yet against a live backend in a browser; the tests mock the API. Content sections (questions, Dress Up, etc.) arrive with Milestones 2–4.
