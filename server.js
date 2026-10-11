import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://gemini-5y0p.onrender.com",
        "X-Title": "Gemini"
      },
      body: JSON.stringify({
        model: "apodex/apodex-1.1-mini:free",
        messages: messages
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "API hatası" });
    }

    const text = data.choices?.[0]?.message?.content || "";
    res.json({
      candidates: [{
        content: {
          parts: [{ text }]
        }
      }]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/app", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: ${PORT}`);
});
