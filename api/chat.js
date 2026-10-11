export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Sadece POST" });
  }

  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Mesaj yok" });
  }

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
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-3.8-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
