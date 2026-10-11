import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, doc, getDoc, setDoc, query, where, serverTimestamp, updateDoc
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
const userAvatar = document.getElementById("userAvatar");
const main = document.querySelector(".main");

const LOGO = "https://i.imgur.com/viQJmJY.png";

const SHIMMER_HTML = `
  <div class="loader">
    <div class="bar"></div>
    <div class="bar"></div>
    <div class="bar"></div>
  </div>
`;

let currentUser = null;
let currentChatId = null;
let autoScroll = true;

main.addEventListener("scroll", () => {
  const nearBottom = main.scrollHeight - main.scrollTop - main.clientHeight < 80;
  autoScroll = nearBottom;
});

function scrollToBottom() {
  if (autoScroll) main.scrollTop = main.scrollHeight;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login";
    return;
  }
  currentUser = user;
  userName.textContent = user.displayName || user.email;
  if (user.photoURL) {
    userAvatar.style.backgroundImage = `url(${user.photoURL})`;
  }
  await loadChats();
  promptInput.focus();
});

menuBtn.addEventListener("click", () => sidebar.classList.add("open"));
sidebarClose.addEventListener("click", () => sidebar.classList.remove("open"));

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/login";
});

newChatBtn.addEventListener("click", () => {
  currentChatId = null;
  chat.innerHTML = "";
  welcome.classList.remove("hidden");
  promptInput.value = "";
  promptInput.focus();
  sidebar.classList.remove("open");
  loadChats();
});

promptInput.addEventListener("input", () => {
  sendBtn.classList.toggle("visible", promptInput.value.trim().length > 0);
});

promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

async function loadChats() {
  chatList.innerHTML = "";
  const q = query(
    collection(db, "chats"),
    where("uid", "==", currentUser.uid)
  );
  const snap = await getDocs(q);
  const chats = [];
  snap.forEach((d) => chats.push({ id: d.id, ...d.data() }));
  chats.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  chats.forEach((c) => {
    const item = document.createElement("div");
    item.className = "sidebar__recent-item";
    if (c.id === currentChatId) item.classList.add("active");
    item.innerHTML = `<span>${escapeHtml(c.title || "Yeni sohbet")}</span>`;
    item.addEventListener("click", () => loadChat(c.id));
    chatList.appendChild(item);
  });
}

async function loadChat(chatId) {
  if (currentChatId === chatId) {
    sidebar.classList.remove("open");
    return;
  }
  currentChatId = chatId;
  chat.innerHTML = "";
  welcome.classList.add("hidden");
  await loadChats();

  const msgSnap = await getDocs(collection(db, "chats", chatId, "messages"));
  const msgs = [];
  msgSnap.forEach((d) => msgs.push(d.data()));
  msgs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

  msgs.forEach((m) => addMessage(m.role, m.text));
  sidebar.classList.remove("open");
}

async function sendMessage() {
  const text = promptInput.value.trim();
  if (!text || !currentUser) return;

  welcome.classList.add("hidden");
  promptInput.value = "";
  sendBtn.classList.remove("visible");
  autoScroll = true;
  addMessage("user", text);

  if (!currentChatId) {
    const docRef = await addDoc(collection(db, "chats"), {
      uid: currentUser.uid,
      title: text.slice(0, 40),
      createdAt: serverTimestamp()
    });
    currentChatId = docRef.id;
    generateTitle(currentChatId, text);
  }

  await addDoc(collection(db, "chats", currentChatId, "messages"), {
    role: "user",
    text,
    timestamp: serverTimestamp()
  });

  await loadChats();

  const historySnap = await getDocs(collection(db, "chats", currentChatId, "messages"));
  const history = [];
  historySnap.forEach((d) => history.push(d.data()));
  history.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

  const aiMsgEl = addStreamingMessage();
  let fullText = "";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history: history.slice(0, -1)
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let started = false;

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
              if (!started) {
                started = true;
                aiMsgEl.classList.add("caret");
                aiMsgEl.innerHTML = "";
              }
              fullText += parsed.text;
              updateStreamingMessage(aiMsgEl, fullText);
            }
          } catch (e) {}
        }
      }
    }

    aiMsgEl.classList.remove("caret");

    await addDoc(collection(db, "chats", currentChatId, "messages"), {
      role: "ai",
      text: fullText,
      timestamp: serverTimestamp()
    });

    await loadChats();
  } catch (err) {
    aiMsgEl.classList.remove("caret");
    updateStreamingMessage(aiMsgEl, "Hata: " + err.message);
  }
}

async function generateTitle(chatId, firstMessage) {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Bu sohbet için 3-5 kelimelik kısa bir başlık üret. Sadece başlığı yaz, başka hiçbir şey yazma. Mesaj: "${firstMessage}"`
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
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
            if (parsed.text) fullText += parsed.text;
          } catch (e) {}
        }
      }
    }

    const title = fullText.trim();
    if (title) {
      await updateDoc(doc(db, "chats", chatId), { title: title.slice(0, 60) });
      await loadChats();
    }
  } catch (e) {
    console.error("Başlık üretilemedi", e);
  }
}

function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `chat__msg chat__msg--${role === "user" ? "user" : "ai"}`;
  if (role === "user") {
    msg.innerHTML = `<div class="chat__bubble">${escapeHtml(text)}</div>`;
  } else {
    msg.innerHTML = `
      <div class="chat__avatar chat__avatar--ai"><img src="${LOGO}" alt="Gemini" class="chat-logo"></div>
      <div class="chat__bubble">${formatText(text)}</div>
    `;
  }
  chat.appendChild(msg);
  scrollToBottom();
  return msg;
}

function addStreamingMessage() {
  const msg = document.createElement("div");
  msg.className = "chat__msg chat__msg--ai";
  msg.innerHTML = `
    <div class="chat__avatar chat__avatar--ai"><img src="${LOGO}" alt="Gemini" class="chat-logo"></div>
    <div class="chat__bubble">${SHIMMER_HTML}</div>
  `;
  chat.appendChild(msg);
  autoScroll = true;
  scrollToBottom();
  return msg.querySelector(".chat__bubble");
}

function updateStreamingMessage(el, text) {
  el.innerHTML = formatText(text);
  scrollToBottom();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatText(text) {
  let html = escapeHtml(text);

  // Kod blokları
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");

  // Tablolar
  html = html.replace(/((?:^\|.+\|\s*$\n?)+)/gm, (tableBlock) => {
    const lines = tableBlock.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) return tableBlock;
    const headerLine = lines[0];
    const separatorLine = lines[1];
    if (!/^\|[\s\-:|]+\|$/.test(separatorLine.trim())) return tableBlock;

    const headers = headerLine.split("|").slice(1, -1).map(h => h.trim());
    const rows = lines.slice(2).map(l => l.split("|").slice(1, -1).map(c => c.trim()));

    let table = "<table><thead><tr>";
    headers.forEach(h => table += `<th>${h}</th>`);
    table += "</tr></thead><tbody>";
    rows.forEach(row => {
      table += "<tr>";
      row.forEach(c => table += `<td>${c}</td>`);
      table += "</tr>";
    });
    table += "</tbody></table>";
    return table;
  });

  // Satır içi kod
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

  // Başlıklar
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Linkler
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Listeler
  html = html.replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");
  html = html.replace(/^\s*\d+\. (.+)$/gm, "<li>$1</li>");

  // Satır sonları
  html = html.replace(/\n/g, "<br>");
  html = html.replace(/<\/table><br>/g, "</table>");
  html = html.replace(/<br><table>/g, "<table>");
  html = html.replace(/<\/pre><br>/g, "</pre>");
  html = html.replace(/<br><pre>/g, "<pre>");

  return html;
}
