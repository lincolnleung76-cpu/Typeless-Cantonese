import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 24 * 1024 * 1024 } });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function buildRewriteMessages(text, lang) {
  if (lang === "yue") {
    return [
      {
        role: "system",
        content:
          "你是一個非常強的廣東話口語轉書面語助手。你的工作是把老人家快速講出來的內容，整理成自然、清晰、簡潔、容易閱讀的繁體中文。請移除口頭禪、語氣詞、重複字句、猶豫聲，例如『呃』『啊』『即係』『咁』『呢個』『嗰個』『然之後』等。保留原意，不要亂加內容。若句子零碎，請主動重組成完整、通順的句子。只輸出整理後內容，不要解釋。"
      },
      { role: "user", content: text }
    ];
  }

  return [
    {
      role: "system",
      content:
        "You are an expert voice-dictation rewriting assistant. Rewrite fast, messy speech into polished, clear, natural writing. Remove filler words, false starts, repetitions, and hesitation. Preserve the original meaning. If the speaker talks quickly or in fragments, reconstruct the message into complete, readable sentences. Output only the rewritten text."
    },
    { role: "user", content: text }
  ];
}

async function transcribeAudio(file, lang) {
  const baseUrl = process.env.TRANSCRIBE_BASE_URL;
  const apiKey = process.env.TRANSCRIBE_API_KEY;
  const model = process.env.TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";

  if (!baseUrl || !apiKey || !file) return null;

  const form = new FormData();
  const mimeType = file.mimetype || "audio/webm";
  const filename = file.originalname || `recording.${mimeType.includes("mp4") ? "m4a" : "webm"}`;
  form.append("file", new Blob([file.buffer], { type: mimeType }), filename);
  form.append("model", model);
  form.append("response_format", "json");

  if (lang === "yue") {
    form.append("prompt", "Transcribe Cantonese speech accurately. Keep Traditional Chinese text where natural.");
  } else {
    form.append("prompt", "Transcribe English speech accurately and preserve intended meaning.");
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Transcription failed: ${errorText}`);
  }

  const data = await response.json();
  return data?.text?.trim() || null;
}

async function rewriteText(text, lang) {
  const baseUrl = process.env.REWRITE_BASE_URL;
  const apiKey = process.env.REWRITE_API_KEY;
  const model = process.env.REWRITE_MODEL || "gpt-4o-mini";

  if (!baseUrl || !apiKey || !text?.trim()) return null;

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      messages: buildRewriteMessages(text, lang)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Rewrite failed: ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

app.get("/api/health", (req, res) => {
  const aiTranscribeReady = Boolean(process.env.TRANSCRIBE_API_KEY && process.env.TRANSCRIBE_BASE_URL);
  const aiRewriteReady = Boolean(process.env.REWRITE_API_KEY && process.env.REWRITE_BASE_URL);
  res.json({ ok: true, aiTranscribeReady, aiRewriteReady });
});

app.post("/api/rewrite-text", async (req, res) => {
  const { text, lang = "en", localFallback = "" } = req.body || {};

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing text" });
  }

  try {
    const rewritten = await rewriteText(text, lang);
    return res.json({ rewritten: rewritten || localFallback || text, usedFallback: !rewritten });
  } catch (error) {
    return res.json({ rewritten: localFallback || text, usedFallback: true, error: error.message });
  }
});

app.post("/api/process-audio", upload.single("audio"), async (req, res) => {
  const lang = req.body?.lang || "en";
  const localFallback = req.body?.localFallback || "";

  if (!req.file) {
    return res.status(400).json({ error: "Missing audio file" });
  }

  try {
    const transcript = await transcribeAudio(req.file, lang);

    if (!transcript) {
      return res.status(503).json({
        error: "AI transcription is not configured. Use Browser mode or add API keys.",
        usedFallback: true
      });
    }

    let rewritten = null;
    try {
      rewritten = await rewriteText(transcript, lang);
    } catch {
      rewritten = null;
    }

    return res.json({
      transcript,
      rewritten: rewritten || localFallback || transcript,
      usedFallback: !rewritten
    });
  } catch (error) {
    return res.status(500).json({ error: error.message, usedFallback: true });
  }
});

app.use(express.static(distDir));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  return res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Voice Polish server running at http://localhost:${port}`);
});
