import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, doc, query, where, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const chat = document.getElementById("chat");
const welcome = document.getElementById("welcome");
const welcomeTitle = document.getElementById("welcomeTitle");
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
const modelSelector = document.getElementById("modelSelector");

const EVIL_LOGO = "https://i.imgur.com/xSSVkY4.png";
const RESEARCH_REGEX = /araştır|internetten bak|web'de ara|incele|kaynak bul/i;

const EVIL_SOURCES = [
  { domain: "wikipedia.org", title: "Büyük dil modelleri" },
  { domain: "github.com", title: "transformers" },
  { domain: "medium.com", title: "RAG sistemleri" },
  { domain: "arxiv.org", title: "Attention Is All You Need" },
];

const getFavicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

function createEvilResearchLoader() {
  return `
    <div class="evil-research">
      <div class="evil-research__status">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/></svg>
        <span class="evil-status-text">Web'de aranıyor...</span>
      </div>
      <div class="evil-research__sources"></div>
    </div>
  `;
}

let currentUser = null;
let currentChatId = null;
let autoScroll = true;
let isGenerating = false;

main.addEventListener("scroll", () => {
  autoScroll = main.scrollHeight - main.scrollTop - main.clientHeight < 80;
});

function scrollToBottom() {
  if (autoScroll) main.scrollTop = main.scrollHeight;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/login"; return; }
  currentUser = user;
  const displayName = user.displayName || user.email.split("@")[0];
  userName.textContent = displayName;
  if (user.photoURL) userAvatar.style.backgroundImage = `url(${user.photoURL})`;
  welcomeTitle.textContent = `Merhaba, ${displayName}. Ne yapacağız?`;
  await loadChats();
  promptInput.focus();
});

modelSelector.addEventListener("click", () => {
  alert("Görsel oluşturma özelliği yakında.");
});

menuBtn.addEventListener("click", () => sidebar.classList.add("open"));
sidebarClose.addEventListener("click", () => sidebar.classList.remove("open"));

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/login";
});

newChatBtn.addEventListener("click", () => {
  if (isGenerating) return;
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
    if (!isGenerating) sendMessage();
  }
});

sendBtn.addEventListener("click", () => {
  if (!isGenerating) sendMessage();
});

async function loadChats() {
  chatList.innerHTML = "";
  const q = query(collection(db, "chats"), where("uid", "==", currentUser.uid));
  const snap = await getDocs(q);
  const chats = [];
  snap.forEach((d) => chats.push({ id: d.id, ...d.data() }));
  chats.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  chats.forEach((c) => {
    const item = document.createElement("div");
    item.className = "sidebar__recent-item";
    if (c.id === currentChatId) item.classList.add("active");
    item.innerHTML = `<span>${escapeHtml(c.title || "Yeni sohbet")}</span>`;
    item.addEventListener("click", () => { if(!isGenerating) loadChat(c.id); });
    chatList.appendChild(item);
  });
}

async function loadChat(chatId) {
  if (currentChatId === chatId) { sidebar.classList.remove("open"); return; }
  currentChatId = chatId;
  chat.innerHTML = "";
  welcome.classList.add("hidden");
  await loadChats();

  const msgSnap = await getDocs(collection(db, "chats", chatId, "messages"));
  const msgs = [];
  msgSnap.forEach((d) => msgs.push(d.data()));
  msgs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

  msgs.forEach((m) => addMessage(m.role, m.text, m.imageUrl));
  sidebar.classList.remove("open");
}

async function sendMessage() {
  const text = promptInput.value.trim();
  if (!text || !currentUser || isGenerating) return;

  isGenerating = true;
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
    role: "user", text, timestamp: serverTimestamp()
  });

  await loadChats();

  const historySnap = await getDocs(collection(db, "chats", currentChatId, "messages"));
  const history = [];
  historySnap.forEach((d) => history.push(d.data()));
  history.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

  const isResearch = RESEARCH_REGEX.test(text);
  const aiMsgEl = isResearch ? addResearchMessage() : addStreamingMessage();
  let fullText = "";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        message: text, 
        history: history.slice(0, -1),
        isResearch: isResearch
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "API Hatası");
    }

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
                aiMsgEl.innerHTML = "";
              }
              fullText += parsed.text;
              updateStreamingMessage(aiMsgEl, fullText);
            }
          } catch (e) {}
        }
      }
    }

    if (!started) {
      throw new Error("Modelden yanıt gelmedi.");
    }

    aiMsgEl.classList.add("typing-done");
    setTimeout(() => { aiMsgEl.classList.remove("typing-done"); }, 500);

    await addDoc(collection(db, "chats", currentChatId, "messages"), {
      role: "ai", text: fullText, timestamp: serverTimestamp()
    });
    await loadChats();

  } catch (err) {
    aiMsgEl.innerHTML = `<span style="color: red; font-weight: bold;">Hata: ${err.message}</span>`;
  } finally {
    isGenerating = false;
  }
}

async function generateTitle(chatId, firstMessage) {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Bu sohbet için 3-5 kelimelik kısa, karanlık bir başlık üret. Sadece başlığı yaz. Mesaj: "${firstMessage}"`
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
  } catch (e) {}
}

function addMessage(role, text, imageUrl = null) {
  const msg = document.createElement("div");
  msg.className = `chat__msg chat__msg--${role === "user" ? "user" : "ai"}`;
  if (role === "user") {
    msg.innerHTML = `<div class="chat__bubble">${escapeHtml(text)}</div>`;
  } else {
    let html = formatText(text);
    if (imageUrl) {
      html += `<br><img src="${imageUrl}" class="generated-image" alt="Görsel" />`;
    }
    msg.innerHTML = `
      <div class="chat__avatar chat__avatar--ai"><img src="${EVIL_LOGO}" alt="Evil Gemini" class="chat-logo"></div>
      <div class="chat__bubble">${html}</div>
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
    <div class="chat__avatar chat__avatar--ai"><img src="${EVIL_LOGO}" alt="Evil Gemini" class="chat-logo"></div>
    <div class="chat__bubble">
      <div class="gemini-loader">
        <div class="gemini-loader__wrap">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" pathLength="100"/></svg>
          <img class="gemini-loader__logo" src="${EVIL_LOGO}" alt="Gemini">
        </div>
      </div>
    </div>
  `;
  chat.appendChild(msg);
  autoScroll = true;
  scrollToBottom();
  return msg.querySelector(".chat__bubble");
}

function addResearchMessage() {
  const msg = document.createElement("div");
  msg.className = "chat__msg chat__msg--ai";
  msg.innerHTML = `
    <div class="chat__avatar chat__avatar--ai"><img src="${EVIL_LOGO}" alt="Evil Gemini" class="chat-logo"></div>
    <div class="chat__bubble">${createEvilResearchLoader()}</div>
  `;
  chat.appendChild(msg);
  autoScroll = true;
  scrollToBottom();

  const sourcesContainer = msg.querySelector(".evil-research__sources");
  const statusText = msg.querySelector(".evil-status-text");
  
  EVIL_SOURCES.forEach((src, i) => {
    setTimeout(() => {
      if (!msg.isConnected) return;
      const sourceEl = document.createElement("div");
      sourceEl.className = "evil-source";
      sourceEl.innerHTML = `<img src="${getFavicon(src.domain)}" /> <span>${src.domain}</span> - ${src.title}`;
      sourcesContainer.appendChild(sourceEl);
      
      if (i === 1) statusText.innerText = "Siteler okunuyor...";
      if (i === EVIL_SOURCES.length - 1) statusText.innerText = "Bilgiler birleştiriliyor...";
      
      scrollToBottom();
    }, (i + 1) * 1000);
  });

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

  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    const cleanCode = code.replace(/^[a-zA-Z0-9]+\n/, '');
    const escapedCode = escapeHtml(cleanCode.trim());
    return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span>Kod</span>
          <button class="copy-code-btn" onclick="copyCode(this)"><i class='bx bx-copy'></i> Kopyala</button>
        </div>
        <pre><code>${escapedCode}</code></pre>
      </div>
    `;
  });

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

  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  html = html.replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");
  html = html.replace(/^\s*\d+\. (.+)$/gm, "<li>$1</li>");

  html = html.replace(/\n/g, "<br>");
  html = html.replace(/<\/table><br>/g, "</table>");
  html = html.replace(/<br><table>/g, "<table>");
  html = html.replace(/<\/pre><br>/g, "</pre>");
  html = html.replace(/<br><pre>/g, "<pre>");
  html = html.replace(/<\/div><br>/g, "</div>");
  html = html.replace(/<br><div class="code-block-wrapper">/g, '<div class="code-block-wrapper">');

  return html;
}

window.copyCode = function(btn) {
  let code = btn.closest('.code-block-wrapper').querySelector('code').innerText;
  code = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  navigator.clipboard.writeText(code).then(() => {
    btn.innerHTML = `<i class='bx bx-check'></i> Kopyalandı`;
    setTimeout(() => { btn.innerHTML = `<i class='bx bx-copy'></i> Kopyala`; }, 2000);
  });
};
