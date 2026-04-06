# Voice Polish — Full Vite + React Project

This is a **full Vite + React project** with an included **Express backend** for stronger AI transcription and stronger AI rewriting.

## What this version does
- English and Cantonese support
- **AI Audio Mode**: records audio in the browser and sends it to a speech-to-text API
- **Browser Mode**: uses Web Speech API as a backup when AI audio is not configured
- Stronger AI rewriting after transcription
- Stronger Cantonese filler filtering and sentence cleanup
- Save, search, copy, edit, delete, and export notes to **TXT**
- Installable on Android as a **PWA**
- Large text mode for easier family use

## Project structure
```text
voice-polish-vite-react-full/
├── .env.example
├── .gitignore
├── README.md
├── index.html
├── package.json
├── vite.config.js
├── public/
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── manifest.webmanifest
│   └── sw.js
├── server/
│   └── index.js
└── src/
    ├── App.jsx
    ├── main.jsx
    └── styles.css
```

## First-time setup
1. Install **Node.js LTS**.
2. Extract this project.
3. Copy `.env.example` to `.env`.
4. Add your AI API keys to `.env`.
5. Run:

```bash
npm install
npm run dev
```

Open the frontend URL shown by Vite, usually `http://localhost:5173`.

## Environment variables
Example `.env`:

```bash
PORT=3001
VITE_API_BASE_URL=
TRANSCRIBE_BASE_URL=https://api.openai.com/v1/audio/transcriptions
TRANSCRIBE_API_KEY=YOUR_TRANSCRIBE_KEY
TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
REWRITE_BASE_URL=https://api.openai.com/v1/chat/completions
REWRITE_API_KEY=YOUR_REWRITE_KEY
REWRITE_MODEL=gpt-4o-mini
```

## How it works
### AI Audio Mode
- Uses `MediaRecorder` to capture audio.
- Sends the recording to `/api/process-audio`.
- The backend calls a speech-to-text API.
- The backend then sends the transcript to a text rewrite API.
- The app displays both the raw transcript and the polished rewrite.

### Browser Mode
- Uses `SpeechRecognition` / `webkitSpeechRecognition` in supported browsers.
- This gives a backup option if AI audio is not configured yet.

## Deployment for Android installation
### Easiest route: Render
1. Upload this project to GitHub.
2. Create a **Web Service** on Render.
3. Build command:

```bash
npm install && npm run build
```

4. Start command:

```bash
npm start
```

5. Add the environment variables from `.env` into Render.
6. Open the deployed URL in **Chrome on Android**.
7. Tap **Install app** or **Add to Home screen**.

## If AI keys are missing
- **AI Audio Mode** will not work until the transcription API key is added.
- **Browser Mode** will still work if the browser supports speech recognition.
- AI rewrite falls back to local cleanup if rewrite keys are missing.

## Suggested next upgrade
After you test this version with your family, the next improvements I recommend are:
- one-tap grandma mode (even simpler screen)
- text-to-speech playback of the polished message
- favorite quick phrases
- APK packaging with Capacitor
