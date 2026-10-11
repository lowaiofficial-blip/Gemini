import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBlaZTlsT-seQEzGQ88OwxcOuibpH1uHC4",
  authDomain: "gemini-7ef6e.firebaseapp.com",
  projectId: "gemini-7ef6e",
  storageBucket: "gemini-7ef6e.firebasestorage.app",
  messagingSenderId: "749740464928",
  appId: "1:749740464928:web:2c0788f71d6b7823b69545"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
