// ── UTILS ────────────────────────────────────────────────────
// Module extrait le 19/07/2026 (étape 1 de la modularisation, voir STRUCTURE.md).
// Fonctions pures ou à dépendance DOM minimale, sans dépendance à l'état global S
// ni à Firestore. Aucune de ces fonctions n'est appelée depuis un onclick="" inline
// généré en HTML (vérifié) : un simple import suffit, pas besoin de les exposer sur window.

export function fmtDate(v) {
  if (!v) return '';
  if (v.includes('-')) {
    const [y,m,d] = v.split('-');
    return d + '/' + m + '/' + String(y).slice(-2);
  }
  return v;
}

export function toISO(v) {
  if (!v) return '';
  if (v.includes('/')) {
    const p = v.split('/');
    if (p.length === 3) {
      const y = p[2].length === 2 ? '20' + p[2] : p[2];
      return y + '-' + p[1].padStart(2,'0') + '-' + p[0].padStart(2,'0');
    }
  }
  return v;
}

// Ajoute un nombre de jours a une date stockee au format DD/MM/YY (ou ISO), retourne au format DD/MM/YY
export function addDaysToDate(dateStr, days) {
  const iso = toISO(dateStr);
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + (parseInt(days, 10) || 0));
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return fmtDate(y + '-' + m + '-' + day);
}

// Echappe les caracteres HTML speciaux dans un texte libre (notes, noms...) avant insertion via innerHTML,
// pour eviter qu'un "<" ou "&" tape par erreur ne casse l'affichage (voir "Points de vigilance").
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Normalisation texte (majuscules, sans accents) : utilisee pour les comparaisons
// insensibles a la casse/accents (categories, correspondance stations meteo import CSV...).
export function normText(s) {
  return (s || '').toString().trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function toast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = err ? 'err show' : 'show';
  setTimeout(() => { t.className = ''; }, 2800);
}

export function loading(v) {
  document.getElementById('loading').className = v ? '' : 'hide';
}

// confirm dialog
let confirmCb = null;
window.closeConfirm = function() {
  document.getElementById('confirm-overlay').classList.remove('open');
  confirmCb = null;
};
document.getElementById('confirm-ok-btn').onclick = function() {
  if (confirmCb) confirmCb();
  window.closeConfirm();
};
export function confirm2(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-overlay').classList.add('open');
  confirmCb = cb;
}
