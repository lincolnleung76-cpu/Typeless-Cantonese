import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "voice_polish_notes_v3";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const languageOptions = {
  en: {
    label: "English",
    browserSpeechCode: "en-US",
    placeholder: "Speak or type in English… the app will clean and rewrite your message.",
    strongFillers: ["um", "uh", "erm", "er", "eh", "hmm", "mm", "you know", "i mean", "sort of", "kind of"],
    softFillers: ["like", "actually", "basically", "so", "well"]
  },
  yue: {
    label: "廣東話",
    browserSpeechCode: "zh-HK",
    placeholder: "開始講廣東話… app 會先轉文字，再幫你潤飾內容。",
    strongFillers: [
      "嗯", "啊", "呀", "吖", "呃", "err", "er", "eh", "eeh", "嗯嗯", "啊啊",
      "即係", "呢個", "嗰個", "你知啦", "係咪先", "某程度上", "點講呢"
    ],
    softFillers: ["咁", "咁樣", "其實", "然之後", "跟住", "跟著", "就係", "即係話", "老實講", "我諗"],
    sentenceParticles: ["呀", "啊", "啦", "囉", "喎", "㗎", "嘛", "呢", "啫", "吖", "咯"]
  }
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^{}()|[\]\\]/g, (match) => `\\${match}`);
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").replace(/\s+([,.;:!?。！？])/g, "$1").trim();
}

function sentenceCaseEnglish(text) {
  return text
    .split(/([.!?]\s+)/)
    .map((part, index) => (index % 2 === 0 ? part.replace(/(^\s*[a-z])/, (s) => s.toUpperCase()) : part))
    .join("")
    .replace(/(^\s*[a-z])/, (s) => s.toUpperCase());
}

function removeStandaloneFillers(text, fillers) {
  let output = ` ${text} `;
  for (const filler of fillers) {
    const pattern = new RegExp(`(?:^|[\\s,，。.!?])${escapeRegExp(filler)}(?:[\\s,，。.!?]|$)`, "gi");
    output = output.replace(pattern, " ");
  }
  return output.trim();
}

function cleanCantoneseParticles(text, particles) {
  let output = text;
  for (const particle of particles) {
    const repeated = new RegExp(`(?:${escapeRegExp(particle)}){2,}`, "g");
    output = output.replace(repeated, particle);
  }
  const particleGroup = particles.map(escapeRegExp).join("|");
  output = output.replace(new RegExp(`(^|[，,。！？!?\\s])(?:${particleGroup})(?=[，,。！？!?\\s]|$)`, "g"), "$1");
  output = output.replace(new RegExp(`([，,。！？!?])(?:${particleGroup})(?=[，,。！？!?]|$)`, "g"), "$1");
  return output;
}

function polishEnglish(text) {
  const config = languageOptions.en;
  let output = removeStandaloneFillers(text, config.strongFillers);
  output = output
    .replace(/\b(and and)\b/gi, "and")
    .replace(/\b(but but)\b/gi, "but")
    .replace(/\b(so so)\b/gi, "so")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\s*([,.;:!?])\s*/g, "$1 ")
    .replace(/([a-zA-Z])\s+(I)\b/g, "$1. $2");
  output = normalizeWhitespace(output);
  output = sentenceCaseEnglish(output);
  if (output && !/[.!?]$/.test(output)) output += ".";
  return output;
}

function polishCantonese(text) {
  const config = languageOptions.yue;
  let output = removeStandaloneFillers(text, config.strongFillers);
  for (const filler of config.softFillers) {
    const startPattern = new RegExp(`(^|[。！？!?，,\\s])${escapeRegExp(filler)}(?=[，,。！？!?\\s])`, "g");
    output = output.replace(startPattern, "$1");
  }
  output = output
    .replace(/[ ]{2,}/g, " ")
    .replace(/([，,]){2,}/g, "，")
    .replace(/([。！？]){2,}/g, "$1")
    .replace(/[;；]+/g, "，")
    .replace(/[\r\n]+/g, " ");
  output = cleanCantoneseParticles(output, config.sentenceParticles)
    .replace(/\s*[,，]\s*/g, "，")
    .replace(/\s*([。！？])/g, "$1")
    .replace(/\s+/g, "")
    .replace(/，([。！？])/g, "$1")
    .replace(/^，+/, "")
    .replace(/，{2,}/g, "，");
  if (output && !/[。！？]$/.test(output)) output += "。";
  return output;
}

function polishText(text, lang) {
  if (!text?.trim()) return "";
  return lang === "yue" ? polishCantonese(text) : polishEnglish(text);
}

function formatTime(ts) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ts));
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [lang, setLang] = useState("yue");
  const [inputMode, setInputMode] = useState("ai");
  const [recording, setRecording] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [rawText, setRawText] = useState("");
  const [polishedText, setPolishedText] = useState("");
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const [apiHealth, setApiHealth] = useState({ aiTranscribeReady: false, aiRewriteReady: false });
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [largeText, setLargeText] = useState(true);

  const recognitionRef = useRef(null);
  const rawRef = useRef("");
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) setNotes(saved);
    } catch {
      setNotes([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setApiHealth(data))
      .catch(() => setApiHealth({ aiTranscribeReady: false, aiRewriteReady: false }));
  }, []);

  useEffect(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setRecognitionSupported(false);
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageOptions[lang].browserSpeechCode;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += `${transcript} `;
        else interimText += transcript;
      }
      if (finalText) {
        rawRef.current = `${rawRef.current} ${finalText}`.trim();
      }
      setRawText(`${rawRef.current}${interimText ? ` ${interimText}` : ""}`.trim());
    };

    recognition.onend = () => {
      setRecording(false);
    };

    recognition.onerror = () => {
      setRecording(false);
      setStatusMessage("Browser speech typing stopped. You can try again.");
    };

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, [lang]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const localPolishedPreview = useMemo(() => polishText(rawText, lang), [rawText, lang]);

  useEffect(() => {
    if (!rawText.trim()) {
      setPolishedText("");
      return;
    }

    const timer = setTimeout(() => {
      if (apiHealth.aiRewriteReady) {
        void rewriteTextWithAI(rawText);
      } else {
        setPolishedText(localPolishedPreview);
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [rawText, lang, apiHealth.aiRewriteReady]);

  const filteredNotes = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return notes;
    return notes.filter((note) =>
      [note.title, note.raw, note.polished].filter(Boolean).some((item) => item.toLowerCase().includes(keyword))
    );
  }, [notes, search]);

  async function rewriteTextWithAI(text) {
    if (!text.trim() || !apiHealth.aiRewriteReady) {
      setPolishedText(localPolishedPreview);
      return;
    }

    setIsBusy(true);
    setStatusMessage(lang === "yue" ? "AI 正在潤飾內容…" : "AI is rewriting your message…");

    try {
      const response = await fetch(`${API_BASE_URL}/api/rewrite-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang, localFallback: polishText(text, lang) })
      });
      const data = await response.json();
      setPolishedText(data?.rewritten?.trim() || polishText(text, lang));
      setStatusMessage(data?.usedFallback
        ? (lang === "yue" ? "AI 未連線，已使用本地整理" : "AI unavailable, local cleanup used")
        : (lang === "yue" ? "AI 潤飾完成" : "AI rewrite finished"));
    } catch {
      setPolishedText(polishText(text, lang));
      setStatusMessage(lang === "yue" ? "AI 未連線，已使用本地整理" : "AI unavailable, local cleanup used");
    } finally {
      setIsBusy(false);
    }
  }

  async function startBrowserTyping() {
    if (!recognitionRef.current) return;
    rawRef.current = rawText;
    recognitionRef.current.lang = languageOptions[lang].browserSpeechCode;
    recognitionRef.current.start();
    setRecording(true);
    setStatusMessage(lang === "yue" ? "瀏覽器正在聆聽…" : "Browser is listening…");
  }

  function stopBrowserTyping() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  async function startAiRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusMessage("This browser cannot access the microphone.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: preferredType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        await processAudio(blob);
      };

      recorder.start();
      setRecording(true);
      setStatusMessage(lang === "yue" ? "AI 錄音中…講完再按停止。" : "AI recording… press stop when finished.");
    } catch {
      setStatusMessage(lang === "yue" ? "未能開啟咪高峰。" : "Microphone permission was not granted.");
    }
  }

  function stopAiRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function processAudio(blob) {
    if (!blob) return;

    setIsBusy(true);
    setStatusMessage(lang === "yue" ? "正在上傳錄音並轉文字…" : "Uploading audio and transcribing…");

    const form = new FormData();
    const extension = blob.type.includes("mp4") ? "m4a" : "webm";
    form.append("audio", blob, `voice-note.${extension}`);
    form.append("lang", lang);
    form.append("localFallback", polishText(rawText, lang));

    try {
      const response = await fetch(`${API_BASE_URL}/api/process-audio`, {
        method: "POST",
        body: form
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Audio processing failed");
      }

      const transcript = data?.transcript?.trim() || "";
      const rewritten = data?.rewritten?.trim() || polishText(transcript, lang);
      rawRef.current = transcript;
      setRawText(transcript);
      setPolishedText(rewritten);
      setStatusMessage(data?.usedFallback
        ? (lang === "yue" ? "AI 已完成轉文字，本地整理已套用。" : "AI transcription finished, local cleanup applied.")
        : (lang === "yue" ? "AI 轉文字與潤飾完成。" : "AI transcription and rewrite finished."));
    } catch (error) {
      setStatusMessage(error.message || "Could not process audio.");
    } finally {
      setIsBusy(false);
    }
  }

  async function startInput() {
    if (inputMode === "ai") {
      await startAiRecording();
    } else {
      await startBrowserTyping();
    }
  }

  function stopInput() {
    if (inputMode === "ai") stopAiRecording();
    else stopBrowserTyping();
  }

  function saveCurrentNote() {
    const polished = (polishedText || localPolishedPreview).trim();
    if (!rawText.trim() && !polished) return;
    const note = {
      id: crypto.randomUUID(),
      title: (polished || rawText).slice(0, 36) || "Untitled note",
      lang,
      raw: rawText.trim(),
      polished,
      createdAt: Date.now(),
      editing: false,
      source: inputMode
    };
    setNotes((prev) => [note, ...prev]);
    setRawText("");
    rawRef.current = "";
    setPolishedText("");
    setStatusMessage(lang === "yue" ? "已儲存訊息。" : "Message saved.");
  }

  async function copyText(id, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setStatusMessage(lang === "yue" ? "複製失敗，請手動複製。" : "Copy failed. Please copy manually.");
    }
  }

  function updateNote(id, patch) {
    setNotes((prev) => prev.map((note) => (note.id === id ? { ...note, ...patch } : note)));
  }

  function exportNotesToTxt() {
    const lines = ["Voice Polish - Saved Messages", `Exported: ${new Date().toLocaleString()}`, ""];
    notes.forEach((note, index) => {
      lines.push(`Message ${index + 1}`);
      lines.push(`Time: ${formatTime(note.createdAt)}`);
      lines.push(`Language: ${languageOptions[note.lang]?.label || note.lang}`);
      lines.push(`Input mode: ${note.source === "ai" ? "AI audio" : "Browser voice typing"}`);
      lines.push(`Title: ${note.title}`);
      lines.push("Raw:");
      lines.push(note.raw || "");
      lines.push("Polished:");
      lines.push(note.polished || "");
      lines.push("----------------------------------------");
    });
    downloadTextFile("voice-polish-saved-messages.txt", lines.join("\n"));
  }

  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  const textClass = largeText ? "large-text" : "";

  return (
    <div className={`app-shell ${textClass}`}>
      <section className="hero-card">
        <div className="hero-row">
          <div>
            <p className="eyebrow">Family Voice Writing Assistant</p>
            <h1>Voice Polish</h1>
            <p className="subtext">
              This version is designed for stronger AI transcription and stronger AI rewriting, especially when the speaker talks quickly.
            </p>
          </div>
          <div className="hero-actions">
            {installPrompt ? <button className="primary-button" onClick={installApp}>Install on Android</button> : null}
            <button className="secondary-button" onClick={exportNotesToTxt}>Export TXT</button>
          </div>
        </div>

        <div className="toggle-row">
          <button className={lang === "yue" ? "primary-button" : "secondary-button"} onClick={() => setLang("yue")}>廣東話</button>
          <button className={lang === "en" ? "primary-button" : "secondary-button"} onClick={() => setLang("en")}>English</button>
          <button className={inputMode === "ai" ? "primary-button" : "secondary-button"} onClick={() => setInputMode("ai")}>AI Audio Mode</button>
          <button className={inputMode === "browser" ? "primary-button" : "secondary-button"} onClick={() => setInputMode("browser")}>Browser Mode</button>
          <button className={largeText ? "primary-button" : "secondary-button"} onClick={() => setLargeText((v) => !v)}>
            {largeText ? "Large Text On" : "Large Text Off"}
          </button>
        </div>

        <div className="status-box">
          <strong>Status:</strong> {statusMessage}
          <div className="status-hint">
            {inputMode === "ai"
              ? (apiHealth.aiTranscribeReady ? "AI audio transcription is ready." : "AI audio transcription needs API keys. Browser mode still works without keys.")
              : (recognitionSupported ? "Browser voice typing is ready." : "Browser voice typing is not supported in this browser.")}
          </div>
          <div className="status-hint">
            {apiHealth.aiRewriteReady ? "AI rewriting is ready." : "AI rewriting needs API keys. Local cleanup will be used until then."}
          </div>
        </div>
      </section>

      {!recognitionSupported && inputMode === "browser" ? (
        <div className="warning-box">Browser voice typing is not supported here. Use Chrome or Edge on Android, or switch to AI Audio Mode.</div>
      ) : null}

      <div className="grid-layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Raw message</h2>
              <p>{languageOptions[lang].label} • {inputMode === "ai" ? "AI audio capture" : "Browser speech typing"}</p>
            </div>
            <span className={recording ? "badge live" : "badge"}>{recording ? "Listening" : isBusy ? "Working" : "Idle"}</span>
          </div>

          <textarea
            className="editor"
            value={rawText}
            onChange={(event) => {
              setRawText(event.target.value);
              rawRef.current = event.target.value;
            }}
            placeholder={languageOptions[lang].placeholder}
          />

          <div className="button-row">
            {!recording ? (
              <button className="primary-button" onClick={startInput} disabled={isBusy}>Start</button>
            ) : (
              <button className="danger-button" onClick={stopInput}>Stop</button>
            )}
            <button className="secondary-button" onClick={() => void rewriteTextWithAI(rawText)} disabled={isBusy || !rawText.trim()}>
              Rewrite Now
            </button>
            <button className="secondary-button" onClick={() => setRawText(polishedText || localPolishedPreview)}>
              Replace with polished text
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Polished writing</h2>
              <p>{apiHealth.aiRewriteReady ? "Strong AI rewrite with local fallback" : "Local cleanup until AI key is added"}</p>
            </div>
            <span className="badge">Ready</span>
          </div>

          <textarea className="editor muted" value={polishedText || localPolishedPreview} readOnly />

          <div className="button-row">
            <button className="primary-button" onClick={saveCurrentNote}>Save Message</button>
            <button className="secondary-button" onClick={() => copyText("current", polishedText || localPolishedPreview || rawText)}>
              {copiedId === "current" ? "Copied" : "Copy"}
            </button>
          </div>
        </section>
      </div>

      <section className="panel saved-panel">
        <div className="panel-header saved-header">
          <div>
            <h2>Saved messages</h2>
            <p>Messages are stored on this device. You can copy, edit, delete, search, or export them later.</p>
          </div>
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search saved messages"
          />
        </div>

        {filteredNotes.length === 0 ? (
          <div className="empty-state">No saved messages yet. Record or type something, then tap <strong>Save Message</strong>.</div>
        ) : (
          <div className="notes-list">
            {filteredNotes.map((note) => (
              <article key={note.id} className="note-card">
                <div className="note-row">
                  <div>
                    <h3>{note.title}</h3>
                    <p className="note-meta">
                      {formatTime(note.createdAt)} · {languageOptions[note.lang]?.label} · {note.source === "ai" ? "AI audio" : "Browser mode"}
                    </p>
                  </div>
                  <div className="button-row small">
                    <button className="secondary-button" onClick={() => copyText(note.id, note.polished)}>
                      {copiedId === note.id ? "Copied" : "Copy"}
                    </button>
                    <button className="secondary-button" onClick={() => updateNote(note.id, { editing: !note.editing })}>
                      {note.editing ? "Done" : "Edit"}
                    </button>
                    <button className="danger-button" onClick={() => setNotes((prev) => prev.filter((item) => item.id !== note.id))}>
                      Delete
                    </button>
                  </div>
                </div>

                {note.editing ? (
                  <div className="edit-stack">
                    <input
                      className="search-input"
                      value={note.title}
                      onChange={(event) => updateNote(note.id, { title: event.target.value })}
                    />
                    <textarea
                      className="editor compact"
                      value={note.polished}
                      onChange={(event) => updateNote(note.id, { polished: event.target.value })}
                    />
                  </div>
                ) : (
                  <p className="note-text">{note.polished}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
