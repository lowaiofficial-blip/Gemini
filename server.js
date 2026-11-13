import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Statik dosyaları sun
app.use(express.static(path.join(__dirname, "public")));

// Ana sayfa ve giriş sayfası artık ifşa ekranına yönlendiriliyor
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// Sohbet ve admin sayfalarına erişim tamamen kapatıldı, ana sayfaya (ifşa ekranına) geri atılıyor
app.get("/app", (req, res) => res.redirect("/"));
app.get("/admin", (req, res) => res.redirect("/"));

// API istekleri de tamamen kapatıldı. Kimse mesaj gönderemez.
app.post("/api/chat", (req, res) => {
  res.status(503).json({ error: "Sistem ifşa olduğu için kapatılmıştır." });
});

app.listen(PORT, () => console.log(`Sunucu ifşa modunda çalışıyor: ${PORT}`));
