import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, doc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const chat = document.getElementById("chat");
const welcome = document.getElementById("welcome");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const sidebar = document.getElementById("sidebar");
const menuBtn = document.getElementById("menuBtn");
const sidebarClose = document.getElementById("sidebarClose");
const newChatBtn = document.getElementById("newChatBtn");
const logoutBtn = document.getElementById("logoutBtn");
const chatList = document.getElementById("chatList");
const userName = document.getElementById("userName");
const main = document.querySelector(".main");

const EVIL_LOGO = "https://i.imgur.com/xSSVkY4.png";
let currentUser = null;
let currentChatId = null;
let isGenerating = false;

function scrollToBottom() { main.scrollTop = main.scrollHeight; }

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/login"; return; }
  currentUser = user;
  userName.textContent = user.displayName || user.email.split("@")[0];
  await loadChats();
});

menuBtn.addEventListener("click", () => sidebar.classList.add("open"));
sidebarClose.addEventListener("click", () => sidebar.classList.remove("open"));
logoutBtn.addEventListener("click", async () => { await signOut(auth); window.location.href = "/login"; });

newChatBtn.addEventListener("click", () => {
  if (isGenerating) return;
  currentChatId = null;
  chat.innerHTML = "";
  welcome.classList.remove("hidden");
  promptInput.value = "";
  loadChats();
});

promptInput.addEventListener("input", () => {
  sendBtn.classList.toggle("visible", promptInput.value.trim().length > 0);
});

promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if(!isGenerating) sendMessage(); }
});

sendBtn.addEventListener("click", () => { if(!isGenerating) sendMessage(); });

async function loadChats() {
  chatList.innerHTML = "";
  const q = query(collection(db, "chats"), where("uid", "==", currentUser.uid));
  const snap = await getDocs(q);
  snap.forEach((d) => {
    const c = d.data();
    const item = document.createElement("div");
    item.className = "sidebar__recent-item";
    item.innerHTML = `<span>${c.title || "Yeni sohbet"}</span>`;
    item.addEventListener("click", () => loadChat(d.id));
    chatList.appendChild(item);
  });
}

async function loadChat(chatId) {
  if (isGenerating) return;
  currentChatId = chatId;
  chat.innerHTML = "";
  welcome.classList.add("hidden");
  const msgSnap = await getDocs(collection(db, "chats", chatId, "messages"));
  msgSnap.forEach((d) => { const m = d.data(); addMessage(m.role, m.text); });
}

async function sendMessage() {
  const text = promptInput.value.trim();
  if (!text || !currentUser || isGenerating) return;

  isGenerating = true;
  welcome.classList.add("hidden");
  promptInput.value = "";
  sendBtn.classList.remove("visible");
  addMessage("user", text);

  if (!currentChatId) {
    const docRef = await addDoc(collection(db, "chats"), { uid: currentUser.uid, title: text.slice(0, 40), createdAt: serverTimestamp() });
    currentChatId = docRef.id;
  }

  await addDoc(collection(db, "chats", currentChatId, "messages"), { role: "user", text, timestamp: serverTimestamp() });

  const aiMsgEl = document.createElement("div");
  aiMsgEl.className = "chat__msg chat__msg--ai";
  aiMsgEl.innerHTML = `
    <div class="chat__avatar chat__avatar--ai"><img src="${EVIL_LOGO}" alt="Evil Gemini" class="chat-logo"></div>
    <div class="chat__bubble" style="color: #a8c7fa;">Bekleniyor...</div>
  `;
  chat.appendChild(aiMsgEl);
  scrollToBottom();

  try {
    const historySnap = await getDocs(collection(db, "chats", currentChatId, "messages"));
    const history = [];
    historySnap.forEach((d) => history.push(d.data()));

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: history.slice(0, -1) })
    });

    // EĞER SUNUCU 500 VEYA BAŞKA BİR HATA DÖNERSE BURADA YAKALARIZ
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Sunucu Hatası: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let first = true;

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
            if (parsed.text) {
              if (first) { aiMsgEl.querySelector(".chat__bubble").innerHTML = ""; first = false; }
              fullText += parsed.text;
              aiMsgEl.querySelector(".chat__bubble").innerText = fullText;
              scrollToBottom();
            }
          } catch (e) {}
        }
      }
    }

    if (!fullText.trim()) {
      throw new Error("Modelden boş yanıt geldi. Groq API çalışıyor ama içi boş dönüyor.");
    }

    await addDoc(collection(db, "chats", currentChatId, "messages"), { role: "ai", text: fullText, timestamp: serverTimestamp() });
    aiMsgEl.querySelector(".chat__bubble").innerHTML = fullText.replace(/\n/g, "<br>");
  } catch (err) {
    // HATA OLURSA EKRANA KIRMIZI YAZIYLA BAS
    aiMsgEl.querySelector(".chat__bubble").innerHTML = `<span style="color:red; font-weight:bold;">SİSTEM HATASI: ${err.message}</span>`;
  } finally {
    isGenerating = false;
  }
}

function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `chat__msg chat__msg--${role === "user" ? "user" : "ai"}`;
  if (role === "user") { msg.innerHTML = `<div class="chat__bubble">${text}</div>`; }
  else {
    msg.innerHTML = `
      <div class="chat__avatar chat__avatar--ai"><img src="${EVIL_LOGO}" class="chat-logo"></div>
      <div class="chat__bubble">${text.replace(/\n/g, "<br>")}</div>
    `;
  }
  chat.appendChild(msg);
  scrollToBottom();
}
