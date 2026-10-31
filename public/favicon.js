import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const DEFAULT_FAVICON = "https://i.imgur.com/teeb0yO.png";

(async () => {
  try {
    const snap = await getDoc(doc(db, "settings", "favicon"));
    const url = snap.exists() && snap.data().url ? snap.data().url : DEFAULT_FAVICON;

    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = url;
  } catch (e) {
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = DEFAULT_FAVICON;
  }
})();
