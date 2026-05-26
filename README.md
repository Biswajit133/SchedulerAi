# SchedulerAI — AI Meeting Scheduler

A production-ready AI-powered meeting scheduler that extracts meeting details from natural language notes, detects calendar conflicts, and creates Google Calendar events with participant invitations.

## Features

- **AI Extraction** — paste raw meeting notes, AI extracts title, participants, date, time, duration, and owner
- **Missing Field Flow** — conversational prompts for any missing details (email, date, time, duration)
- **Google Calendar Integration** — reads busy slots, shows only available times, creates events with Google Meet links
- **Participant Invitations** — sends calendar invites via Google Calendar API
- **Multi-Provider AI** — swap between GROQ, OpenAI, Claude, or Gemini via a single env variable
- **Demo Mode** — works without Google credentials using mock calendar data
- **Dark UI** — responsive Tailwind dashboard

## Tech Stack

| Layer    | Technology                    |
|----------|-------------------------------|
| Frontend | React 18, Vite, TailwindCSS 3 |
| Backend  | Node.js 18+, Express 4        |
| AI       | GROQ / OpenAI / Claude / Gemini |
| Calendar | Google Calendar API v3, OAuth2 |
| Storage  | JSON file (no database)       |

## Project Structure

```
SchedulerAi/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MeetingInput.jsx       # Notes textarea + Extract button
│   │   │   ├── MeetingSummary.jsx     # Extracted meetings grid
│   │   │   ├── MissingFieldForm.jsx   # Step-by-step missing field prompts
│   │   │   ├── AvailableSlots.jsx     # Calendar slot picker
│   │   │   └── ScheduleConfirmation.jsx # Success screen
│   │   ├── services/
│   │   │   └── api.js                 # Axios service layer
│   │   └── pages/
│   │       └── Dashboard.jsx          # Main page with state machine
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── providers/
│   │   │   ├── AIProvider.js          # Abstract base class
│   │   │   ├── GroqProvider.js
│   │   │   ├── OpenAIProvider.js
│   │   │   ├── ClaudeProvider.js
│   │   │   ├── GeminiProvider.js
│   │   │   └── ProviderFactory.js     # Reads AI_PROVIDER from .env
│   │   ├── services/
│   │   │   ├── MeetingService.js      # Core orchestration
│   │   │   ├── CalendarService.js     # Google Calendar API
│   │   │   ├── ConflictService.js     # Conflict detection
│   │   │   └── PromptBuilder.js       # AI prompt templates
│   │   ├── controllers/
│   │   │   └── MeetingController.js
│   │   ├── routes/
│   │   │   └── meetingRoutes.js
│   │   ├── middleware/
│   │   │   └── validation.js
│   │   ├── utils/
│   │   │   ├── DateParser.js          # Relative date parsing
│   │   │   └── SlotFinder.js          # Available slot computation
│   │   ├── config/
│   │   │   └── googleAuth.js          # OAuth2 flow
│   │   └── storage/
│   │       └── meetings.json          # Persisted meetings
│   ├── server.js
│   └── package.json
├── .env.example
└── README.md
```

## Quick Start

### 1. Backend setup

```bash
cd backend
cp ../.env.example .env
# Edit .env — at minimum set GROQ_API_KEY
npm install
npm run dev
```

The API will start at `http://localhost:3001`.

### 2. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### 3. Google Calendar (optional)

Without Google credentials the app runs in **demo mode** — meetings are saved locally and mock calendar data is used.

To enable real Google Calendar:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → Enable **Google Calendar API**
3. Create **OAuth 2.0 Client ID** credentials (Web application)
4. Add `http://localhost:3001/api/auth/google/callback` as an authorized redirect URI
5. Copy Client ID and Secret into `backend/.env`
6. Click **Connect Calendar** in the app navbar and complete the OAuth flow

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/meetings/extract` | Extract meetings from notes |
| POST | `/api/meetings/validate` | Apply missing field answers |
| GET | `/api/meetings/slots` | Get available calendar slots |
| POST | `/api/meetings/schedule` | Create meeting + send invites |
| GET | `/api/meetings` | List all saved meetings |
| GET | `/api/auth/google` | Get Google OAuth URL |
| GET | `/api/auth/google/callback` | OAuth callback handler |
| GET | `/api/auth/status` | Check auth status |
| GET | `/api/health` | Health check |

## Switching AI Providers

Change `AI_PROVIDER` in `backend/.env`:

```env
AI_PROVIDER=groq     # default
AI_PROVIDER=openai
AI_PROVIDER=claude
AI_PROVIDER=gemini
```

Only the API key for the active provider is required.

## Example Meeting Notes

```
Need frontend login page tomorrow.
Backend API Friday.
Testing Monday.
Nihal will handle frontend (nihal@company.com).
Pradeep will verify API (pradeep@company.com).
Each session is 1 hour starting at 10 AM.
```

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `AI_PROVIDER` | Active AI provider (`groq`/`openai`/`claude`/`gemini`) |
| `GROQ_API_KEY` | GROQ API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `CLAUDE_API_KEY` | Anthropic API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | OAuth redirect URI |
| `TIMEZONE` | Timezone for calendar events (e.g. `America/New_York`) |

## License

MIT
