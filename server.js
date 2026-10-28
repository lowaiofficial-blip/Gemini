import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// 1. Sohbet API'si
app.post("/api/chat", async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: "Mesaj yok" });

  const contents = [];
  if (history && Array.isArray(history)) {
    history.forEach((m) => {
      contents.push({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      });
    });
  }
  contents.push({ role: "user", parts: [{ text: message }] });

  try {
    const response = await fetch(`${GEMINI_BASE}/gemini-3.5-flash-lite:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });

    if (!response.ok) {
      const errData = await response.json();
      return res.status(response.status).json({ error: errData.error?.message || "API hatası" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          } catch (e) {}
        }
      }
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Görsel Oluşturma API'si
app.post("/api/imagine", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt yok" });

  try {
    const response = await fetch(`${GEMINI_BASE}/gemini-3.1-flash-lite-image:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "Görsel oluşturulamadı" });
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData && p.inlineData.mimeType.startsWith("image/"));
    const textPart = parts.find(p => p.text);

    if (!imagePart) {
      return res.status(400).json({ error: textPart ? textPart.text : "Görsel üretilemedi." });
    }

    res.json({
      image: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
      text: textPart ? textPart.text : ""
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ImgBB favicon upload
app.post("/api/upload-favicon", async (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ error: "Resim yok" });

  try {
    const formData = new FormData();
    formData.append("key", process.env.IMGBB_API_KEY);
    formData.append("image", image);

    const response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (!data.success) {
      return res.status(400).json({ error: data.error?.message || "Yükleme başarısız" });
    }

    res.json({ url: data.data.url, display_url: data.data.display_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sayfa route'ları
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/app", (req, res) => res.sendFile(path.join(__dirname, "public", "app.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: ${PORT}`);
});
