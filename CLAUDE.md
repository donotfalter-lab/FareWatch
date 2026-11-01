# FareWatch

FareWatch lets users save **trip watches** (flight searches), run **price checks** that are
saved as price history, view that history as a **chart**, and ask an **AI** whether to book
now or wait. The AI answer is saved to the database.

The code is shown in a demo video, so keep it **simple and readable**: small functions, clear
names, and no clever abstractions. Comments explain *why*, not *what*.

## Tech stack

- **Backend** (`server/`): Flask, Flask-SQLAlchemy, Flask-Migrate, Flask-JWT-Extended,
  Flask-Bcrypt, Flask-CORS, python-dotenv, Pipenv, SQLite. Runs on **port 5555**.
- **Frontend** (`client/`): React + Vite, React Router, Recharts.
- **Outside services** (called only from the server):
  - **SerpApi** (Google Flights engine) for prices.
  - **Google Gemini** (`google-genai` package) for book-now-or-wait recommendations.

### Dev proxy

The Vite dev server proxies `/api` to Flask and strips the prefix: the frontend calls
`/api/login`, Flask receives `/login`. **Flask routes never start with `/api`.** If Flask is
down, the proxy answers with a 503 JSON error (`{"error": "Can't reach the server..."}`).

## Reference project

Follow the structure and patterns of ApplyTrack at `/home/donotfalter/ApplyTrack/ApplyTrack`.
Read the matching file there before writing its FareWatch version:

| FareWatch file | Pattern to copy from ApplyTrack |
| --- | --- |
| `server/config.py` | Creates `app`, `db` (with FK naming convention metadata), `migrate` (`render_as_batch=True`), `bcrypt`, `jwt`, `CORS(app)`; calls `load_dotenv()`; JWT expires in 24h; DB is `sqlite:///app.db` |
| `server/models.py` | `to_dict()` methods (no serializer library), `@validates` for input checks raising `ValueError`, `__repr__`, UTC `created_at` defaults |
| `server/app.py` | Helpers `error()`, `auth_payload()`, `current_user_id()`, `json_body()`, `commit()`, `owned_<thing>()`; JSON error handlers for 404, `ValueError`, and JWT loaders; `app.run(port=5555, debug=True)` |
| `server/ai_service.py` | Settings read from env each call, mock mode, a custom `AIServiceError(message, status_code)`, friendly translation of API errors |
| `client/vite.config.js` | `/api` proxy (already copied) |
| `client/src/api.js` | `apiFetch(path, { method, body })`, token in `localStorage`, 401 handler that logs the user out |
| `client/src/context/AuthContext.jsx` | `AuthProvider` + `useAuth()`; restores user via `/me` on load |
| `client/src/components/ProtectedRoute.jsx` | Redirects to `/login` when logged out |
| `client/src/components/PublicOnlyRoute.jsx` | Redirects logged-in users away from login/signup |

FareWatch adds `server/price_service.py` for SerpApi, built the same way as `ai_service.py`
(own `PriceServiceError`, mock mode). Use the token key `farewatch_token` in `api.js`.

## Data model

All relationships use `cascade="all, delete-orphan"` on the parent side and `back_populates`.

- **User** (`users`): `id`, `username` (unique, required), `_password_hash` (bcrypt).
  - `password_hash` is a `hybrid_property` whose getter raises `AttributeError` (it can never
    be read); the setter hashes with bcrypt. `authenticate(password)` checks it.
  - `to_dict()` never includes the hash.
  - Has many **TripWatches**.
- **TripWatch** (`trip_watches`): `id`, `user_id` (FK → users), `trip_type` (default
  `"flight"`), `origin`, `destination`, `start_date`, `end_date`, `travelers`,
  `target_price`, `created_at`.
  - Has many **PriceChecks** and **Recommendations**.
- **PriceCheck** (`price_checks`): `id`, `trip_watch_id` (FK → trip_watches),
  `lowest_price`, `currency`, `provider`, `details` (JSON), `checked_at`.
- **Recommendation** (`recommendations`): `id`, `trip_watch_id` (FK → trip_watches),
  `prompt`, `generated_text`, `created_at`.

## Rules

1. **Auth on every protected route**: use `@jwt_required()`.
2. **Scope every query to the logged-in user.** Look up records through the user, e.g.
   `TripWatch.query.filter_by(id=..., user_id=current_user_id())`; for child records
   (PriceCheck, Recommendation) join to TripWatch and filter on `TripWatch.user_id`.
   **Another user's record returns 404**, never 403, so ids are not leaked.
3. **JWT identity is a string**: `create_access_token(identity=str(user.id))`, and read it
   back with `int(get_jwt_identity())`.
4. **API keys stay on the server** in `server/.env` (never committed). They never appear in
   responses, logs sent to the client, or any file under `client/`. The browser only talks to
   Flask through `/api`.
5. **Mock mode for both outside services.** When the key is missing *or* the mock flag is
   true, return realistic sample data instead of calling the API:
   - `PRICE_MOCK=true` or no `SERPAPI_KEY` → sample flight prices (plausible fares,
     airlines, and a `details` JSON shaped like the real response we store).
   - `AI_MOCK=true` or no `GEMINI_API_KEY` → a sample book-now-or-wait recommendation that
     uses the trip's real numbers (target price, latest price, trend).
6. **Errors are JSON**: `{"error": "message"}` with a fitting status code (400, 401, 404,
   405, 409, 429, 500, 502, 504). Never send internal details in a 500.
7. **Keep it simple**: no extra libraries without a reason, no premature abstraction.

## Conventions already in the code

Backend:
- `parse_trip_fields()` in `app.py` converts request values; model `@validates` methods
  enforce the rules. A `ValueError` from either becomes a 400 automatically.
- The API requires `end_date` even though the database column allows empty.
- Set trip fields with `update_trip_fields()`. It handles moving both dates at once, which
  would otherwise fail because each date is checked against the other as it is set.
- `provider` is `"mock"` for sample prices. `PriceCheck.details` holds `airline`, `stops`,
  and `duration_minutes`, so `price_service.py` must store those same fields.
- Live price checks have `provider` `"serpapi"`. Their `details` describe the outbound leg
  only, and all three values are empty if only `price_insights` had a price.
- `POST /trips/<id>/price-checks` returns 429 if the trip's last check is under 2 minutes old.
- Recommendations start with a label on the first line: `BOOK NOW`, `KEEP WATCHING`, or
  `NOT ENOUGH DATA`. `Recommendation.to_dict()` exposes it as `verdict` (`None` if missing).
- `TripWatch.to_dict()` includes `latest_price`, `price_check_count`, and
  `at_or_below_target`. `GET /trips/<id>` adds `price_checks` (oldest first, for charting)
  and `recommendations` (newest first).

Frontend:
- Pages fetch in `useEffect` with the `ignore` flag and handle loading, error, and 404
  ("Trip not found") states.
- Format values with `client/src/utils/format.js`. Never use `new Date("YYYY-MM-DD")`,
  because it shows dates a day early in the Americas.
- Two routes that share a component get different `key`s (see `TripForm` in `App.jsx`), or
  React keeps the old state when moving between them.
- All styles live in `client/src/index.css` and use its CSS variables.
- `checked_at` and `created_at` are UTC with no timezone marker, so read them with
  `toTimestamp()` from `format.js`. Otherwise they show in the wrong hour.

## Git workflow

- One branch per step, named `feature/<name>`, created from an up-to-date `main`.
- Show `git status` before committing, and commit with the message given for the step.
- Do not merge or push until told to.

## Environment variables (`server/.env`, see `server/.env.example`)

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET_KEY` | Signs login tokens. Use a random value, never the `.env.example` placeholder |
| `SERPAPI_KEY` | SerpApi key; blank → mock prices |
| `GEMINI_API_KEY` | Gemini key; blank → mock recommendations |
| `GEMINI_MODEL` | Gemini model name (default `gemini-3.8-flash`) |
| `AI_MOCK` | `true` forces mock recommendations |
| `PRICE_MOCK` | `true` forces mock prices |

## Project layout

```
FareWatchh/
├── CLAUDE.md
├── .gitignore
├── server/
│   ├── Pipfile
│   ├── .env.example       # copy to .env
│   ├── config.py          # app, db, jwt, bcrypt setup
│   ├── models.py          # User, TripWatch, PriceCheck, Recommendation
│   ├── app.py             # routes
│   ├── seed.py            # demo data (demo and demo2, password123)
│   ├── migrations/
│   ├── price_service.py   # SerpApi + mock
│   └── ai_service.py      # Gemini + mock
└── client/                # Vite + React
    ├── vite.config.js     # /api proxy → localhost:5555
    └── src/
        ├── api.js
        ├── context/AuthContext.jsx
        ├── components/    # NavBar, LoginForm, SignupForm, TripCard, route guards, ...
        ├── pages/         # Dashboard, TripForm, TripDetail, NotFound
        └── utils/format.js
```

## Commands

```bash
# Backend (run `deactivate` first if another project's virtualenv is active)
cd server
pipenv install
cp .env.example .env                 # then set JWT_SECRET_KEY
pipenv run flask --app app db upgrade
pipenv run python seed.py            # clears all tables, then adds the demo data
pipenv run python app.py             # http://localhost:5555

# Frontend
cd client
npm install
npm run dev                          # http://localhost:5173
npm run build
npm run lint
```

## Build order

1. ✅ Project setup and this file.
2. ✅ Models, migrations, and seed data.
3. ✅ Auth routes (`/signup`, `/login`, `/me`).
4. ✅ TripWatch CRUD routes.
5. ✅ Frontend auth (api.js, AuthContext, route guards, login/signup forms).
6. ✅ Frontend dashboard, trip create/edit form, and detail page with placeholder sections.
7. ✅ Price checks (`price_service.py`) and price history routes.
8. ✅ Frontend "Price History" section with a Recharts chart.
9. ✅ Recommendations (`ai_service.py`) routes.
10. Frontend "Should I Book?" section.
11. README and final polish.
