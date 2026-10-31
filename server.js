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

// 1. Sohbet API'si
app.post("/api/chat", async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: "Mesaj yok" });

  const messages = [];
  if (history && Array.isArray(history)) {
    history.forEach((m) => {
      messages.push({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      });
    });
  }
  messages.push({ role: "user", content: message });

  let attempts = 0;
  const maxAttempts = 3;

  const tryRequest = async () => {
    attempts++;
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://gemini-czrt.onrender.com",
          "X-Title": "Gemini"
        },
        body: JSON.stringify({
          model: "cohere/north-mini-code:free",
          messages: messages,
          stream: true
        }),
      });

      if (!response.ok) {
        if (attempts < maxAttempts) {
          console.log(`Deneme ${attempts} başarısız, tekrar deneniyor...`);
          await new Promise(r => setTimeout(r, 1000));
          return tryRequest();
        }
        const errData = await response.json();
        return res.status(response.status).json({ error: errData.error?.message || "Sağlayıcı hatası" });
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
            if (data === "[DONE]") {
              res.write("data: [DONE]\n\n");
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }
      res.end();
    } catch (err) {
      if (attempts < maxAttempts) {
        console.log(`Hata: ${err.message}, tekrar deneniyor...`);
        await new Promise(r => setTimeout(r, 1000));
        return tryRequest();
      }
      res.status(500).json({ error: err.message });
    }
  };

  await tryRequest();
});

// 2. Görsel Oluşturma (Şimdilik boş)

// 3. ImgBB favicon upload
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
