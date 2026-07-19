// ── FIREBASE : CONFIG, INIT, AUTH, CHEMINS FIRESTORE ────────
// Module extrait le 19/07/2026 (étape 3 de la modularisation, voir STRUCTURE.md).
//
// Perimetre volontairement limite a ce qui est autonome (config, connexion, chemins
// de collections/documents). listenBase()/listenExploit()/init() restent dans le
// script principal pour l'instant : elles appellent render(), renderExploitations(),
// updateTopbar(), qui ne sont pas encore extraites (ce sera fait avec dashboard.js,
// etape suivante). Les extraire maintenant aurait oblige a un aller-retour de callbacks
// entre modules pour rien - on le fera proprement une fois dashboard.js pret.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyARkXeCqBH2lSbfG_YsTuMJfY6NtUrwosg",
  authDomain: "registre-phytos.firebaseapp.com",
  projectId: "registre-phytos",
  storageBucket: "registre-phytos.firebasestorage.app",
  messagingSenderId: "59831753473",
  appId: "1:59831753473:web:80870d9b89043e8f5fd900"
};

const fbApp = initializeApp(firebaseConfig);
export const db = getFirestore(fbApp);
const auth = getAuth(fbApp);

// ── AUTHENTIFICATION ANONYME (invisible pour l'utilisateur) ──
// Se connecte automatiquement en arriere-plan, sans ecran de login.
// Necessaire car les regles Firestore exigent desormais request.auth != null.
export function waitForAuth() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        resolve(user);
      } else {
        signInAnonymously(auth).catch(reject);
      }
    }, reject);
  });
}

// ── CHEMINS FIRESTORE ────────────────────────────────────────
export const exploitsCol = () => collection(db, 'exploitations');
export const exploitDoc = id => doc(db, 'exploitations', id);
export const sub = (eid, name) => collection(db, 'exploitations', eid, name);
export const subdoc = (eid, name, id) => doc(db, 'exploitations', eid, name, id);
// Bases communes par type
export const baseCol = (type, name) => collection(db, 'bases', type, name);
export const baseDoc = (type, name, id) => doc(db, 'bases', type, name, id);
export const backupsCol = () => collection(db, 'backups');
