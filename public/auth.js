import { auth, googleProvider } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase.js";

const googleBtn = document.getElementById("googleBtn");
const submitBtn = document.getElementById("submitBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authError = document.getElementById("authError");
const authSub = document.getElementById("authSub");
const toggleText = document.getElementById("toggleText");
const toggleLink = document.getElementById("toggleLink");

let isRegister = false;

toggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  isRegister = !isRegister;
  authSub.textContent = isRegister ? "Hesap oluştur" : "Hesabına giriş yap";
  submitBtn.textContent = isRegister ? "Kayıt ol" : "Giriş yap";
  toggleText.textContent = isRegister ? "Zaten hesabın var mı?" : "Hesabın yok mu?";
  toggleLink.textContent = isRegister ? "Giriş yap" : "Kayıt ol";
  authError.textContent = "";
});

async function saveUser(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email,
      displayName: user.displayName || user.email.split("@")[0],
      photoURL: user.photoURL || "",
      role: user.email === "devy.build.backup@gmail.com" ? "admin" : "user",
      createdAt: serverTimestamp()
    });
  }
}

googleBtn.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await saveUser(result.user);
  } catch (err) {
    authError.textContent = err.message;
  }
});

submitBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  authError.textContent = "";

  if (!email || !password) {
    authError.textContent = "E-posta ve şifre gerekli";
    return;
  }

  try {
    if (isRegister) {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: email.split("@")[0] });
      await saveUser(result.user);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    authError.textContent = err.message;
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "app.html";
  }
});
