import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const adminChats = document.getElementById("adminChats");
const filterUser = document.getElementById("filterUser");
const filterText = document.getElementById("filterText");
const statUsers = document.getElementById("statUsers");
const statChats = document.getElementById("statChats");
const statMessages = document.getElementById("statMessages");

let allChats = [];
let allUsers = {};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists() || userDoc.data().role !== "admin") {
    alert("Yetkin yok");
    window.location.href = "app.html";
    return;
  }
  await loadData();
});

document.getElementById("adminLogout").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

async function loadData() {
  const usersSnap = await getDocs(collection(db, "users"));
  usersSnap.forEach((d) => { allUsers[d.id] = d.data(); });
  statUsers.textContent = usersSnap.size;

  const chatsSnap = await getDocs(collection(db, "chats"));
  allChats = [];
  let msgCount = 0;
  for (const c of chatsSnap.docs) {
    const chatData = { id: c.id, ...c.data() };
    const msgSnap = await getDocs(collection(db, "chats", c.id, "messages"));
    chatData.messages = [];
    msgSnap.forEach((m) => chatData.messages.push(m.data()));
    chatData.messages.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
    msgCount += chatData.messages.length;
    allChats.push(chatData);
  }
  statChats.textContent = allChats.length;
  statMessages.textContent = msgCount;

  renderChats();
}

function renderChats() {
  const userFilter = filterUser.value.trim().toLowerCase();
  const textFilter = filterText.value.trim().toLowerCase();

  adminChats.innerHTML = "";

  allChats.forEach((c) => {
    const user = allUsers[c.uid];
    const userEmail = user?.email || c.uid;

    if (userFilter && !userEmail.toLowerCase().includes(userFilter)) return;

    const filteredMsgs = c.messages.filter((m) =>
      !textFilter || m.text.toLowerCase().includes(textFilter)
    );
    if (textFilter && filteredMsgs.length === 0) return;

    const div = document.createElement("div");
    div.className = "admin-chat";
    div.innerHTML = `
      <div class="admin-chat__head">
        <strong>${escapeHtml(c.title || "Başlıksız")}</strong>
        <span>${escapeHtml(userEmail)}</span>
      </div>
      <div class="admin-chat__msgs">
        ${filteredMsgs.map((m) => `
          <div class="admin-msg admin-msg--${m.role}">
            <b>${m.role === "user" ? "Kullanıcı" : "Gemini"}:</b>
            <p>${escapeHtml(m.text)}</p>
          </div>
        `).join("")}
      </div>
    `;
    adminChats.appendChild(div);
  });
}

filterUser.addEventListener("input", renderChats);
filterText.addEventListener("input", renderChats);

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
