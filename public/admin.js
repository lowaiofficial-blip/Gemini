import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const viewUsers = document.getElementById("viewUsers");
const viewChats = document.getElementById("viewChats");
const viewMessages = document.getElementById("viewMessages");

const userList = document.getElementById("userList");
const chatList = document.getElementById("chatList");
const messageList = document.getElementById("messageList");

const filterUser = document.getElementById("filterUser");
const filterText = document.getElementById("filterText");

const statUsers = document.getElementById("statUsers");
const statChats = document.getElementById("statChats");
const statMessages = document.getElementById("statMessages");

const backBtn = document.getElementById("backBtn");
const adminTitle = document.getElementById("adminTitle");

const faviconInput = document.getElementById("faviconInput");
const faviconPreview = document.getElementById("faviconPreview");

let allUsers = [];
let allChats = [];
let currentUser = null;
let currentChat = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login";
    return;
  }
  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists() || userDoc.data().role !== "admin") {
    alert("Yetkin yok");
    window.location.href = "/app";
    return;
  }
  await loadFavicon();
  await loadData();
});

document.getElementById("adminLogout").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/login";
});

backBtn.addEventListener("click", () => {
  if (!viewMessages.classList.contains("hide")) {
    viewMessages.classList.add("hide");
    viewChats.classList.remove("hide");
    adminTitle.textContent = currentUser?.email || "Sohbetler";
    backBtn.classList.remove("hide");
  } else if (!viewChats.classList.contains("hide")) {
    viewChats.classList.add("hide");
    viewUsers.classList.remove("hide");
    adminTitle.textContent = "Gemini Admin";
    backBtn.classList.add("hide");
  }
});

async function loadFavicon() {
  try {
    const snap = await getDoc(doc(db, "settings", "favicon"));
    if (snap.exists() && snap.data().url) {
      faviconPreview.src = snap.data().url;
    }
  } catch (e) {}
}

faviconInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    alert("Resim 2MB'dan küçük olmalı");
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(",")[1];

    faviconPreview.style.opacity = "0.5";

    try {
      const response = await fetch("/api/upload-favicon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Yükleme başarısız");

      await setDoc(doc(db, "settings", "favicon"), {
        url: data.url,
        updatedAt: serverTimestamp()
      });

      faviconPreview.src = data.url;

      let link = document.querySelector("link[rel='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = data.url;

      alert("Favicon güncellendi!");
    } catch (err) {
      alert("Hata: " + err.message);
    } finally {
      faviconPreview.style.opacity = "1";
      faviconInput.value = "";
    }
  };
  reader.readAsDataURL(file);
});

async function loadData() {
  const usersSnap = await getDocs(collection(db, "users"));
  const usersMap = {};
  usersSnap.forEach((d) => usersMap[d.id] = { uid: d.id, ...d.data() });

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

  allChats.forEach((c) => {
    if (!usersMap[c.uid]) {
      usersMap[c.uid] = { uid: c.uid, email: c.uid, role: "user" };
    }
  });

  allUsers = Object.values(usersMap);
  statUsers.textContent = allUsers.length;
  statChats.textContent = allChats.length;
  statMessages.textContent = msgCount;

  renderUsers();
}

function renderUsers() {
  const filter = filterUser.value.trim().toLowerCase();
  userList.innerHTML = "";

  allUsers
    .filter((u) => !filter || (u.email || "").toLowerCase().includes(filter))
    .forEach((u) => {
      const chatCount = allChats.filter((c) => c.uid === u.uid).length;
      const item = document.createElement("div");
      item.className = "admin-list-item";
      item.innerHTML = `
        <div class="admin-list-item__main">
          <div class="admin-list-item__avatar">${(u.email || "?")[0].toUpperCase()}</div>
          <div>
            <div class="admin-list-item__title">${escapeHtml(u.email || "Bilinmeyen")}</div>
            <div class="admin-list-item__sub">${chatCount} sohbet</div>
          </div>
        </div>
        <i class='bx bx-chevron-right'></i>
      `;
      item.addEventListener("click", () => openUser(u.uid));
      userList.appendChild(item);
    });
}

function openUser(uid) {
  currentUser = allUsers.find((u) => u.uid === uid);
  viewUsers.classList.add("hide");
  viewChats.classList.remove("hide");
  backBtn.classList.remove("hide");
  adminTitle.textContent = currentUser?.email || "Sohbetler";
  filterText.value = "";
  renderChats();
}

function renderChats() {
  const filter = filterText.value.trim().toLowerCase();
  chatList.innerHTML = "";

  const userChats = allChats
    .filter((c) => c.uid === currentUser.uid)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  userChats
    .filter((c) => !filter || (c.title || "").toLowerCase().includes(filter))
    .forEach((c) => {
      const item = document.createElement("div");
      item.className = "admin-list-item";
      item.innerHTML = `
        <div class="admin-list-item__main">
          <i class='bx bx-message-square-dots' style="font-size:1.5rem;color:#a8c7fa"></i>
          <div>
            <div class="admin-list-item__title">${escapeHtml(c.title || "Başlıksız")}</div>
            <div class="admin-list-item__sub">${c.messages.length} mesaj</div>
          </div>
        </div>
        <i class='bx bx-chevron-right'></i>
      `;
      item.addEventListener("click", () => openChat(c));
      chatList.appendChild(item);
    });
}

function openChat(chat) {
  currentChat = chat;
  viewChats.classList.add("hide");
  viewMessages.classList.remove("hide");
  backBtn.classList.remove("hide");
  adminTitle.textContent = chat.title || "Sohbet";

  messageList.innerHTML = "";
  chat.messages.forEach((m) => {
    const div = document.createElement("div");
    div.className = `admin-msg admin-msg--${m.role}`;
    let content = `<b>${m.role === "user" ? "Kullanıcı" : "Gemini"}</b><p>${escapeHtml(m.text)}</p>`;
    if (m.imageUrl) {
      content += `<img src="${m.imageUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;" />`;
    }
    div.innerHTML = content;
    messageList.appendChild(div);
  });
}

filterUser.addEventListener("input", renderUsers);
filterText.addEventListener("input", renderChats);

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
