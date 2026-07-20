// ── PLUVIOMETRIE ─────────────────────────────────────────────
// Module extrait le 19/07/2026 (etape 4 de la modularisation, voir STRUCTURE.md).
//
// Fonctions exportees et utilisees depuis index.html (showPage, renderDash, listenExploit,
// renderExploitations) : renderPluvioPage, renderRainfallCard, renderPluvioStat,
// renderSitesMeteoSection, resetRainfallSync, forgetRainfallSync.
//
// render(), openModal(), closeModal() restent dans index.html (l'orchestrateur global n'est pas
// encore extrait, voir plan). On les appelle ici tels quels (identifiants globaux, sans import) :
// ce sont des fonctions ordinaires exposees sur window depuis le script principal
// (window.render = render / window.openModal = openModal), donc visibles depuis n'importe quel
// module via la chaine de portee globale, meme sans import explicite.

import { getDoc, getDocs, setDoc, addDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { esc, toISO, confirm2, loading, normText, toast } from './utils.js';
import { S, cpPassages } from './state.js';
import { sub, subdoc } from './firebase-data.js';

function getSitesMeteo() {
  return (S.sitesMeteoByExploit[S.currentId] || []).map(s => ({
    key: s.id,
    label: s.nom,
    coords: { lat: s.lat, lon: s.lon }
  }));
}

// Date du dernier passage phyto (hors engrais) de la campagne en cours, au format DD/MM/YY
function getLastPhytoDate() {
  const list = cpPassages().filter(p => p.type !== 'engrais' && p.date);
  let best = null, bestIso = '';
  list.forEach(p => { const iso = toISO(p.date); if (iso && iso > bestIso) { bestIso = iso; best = p.date; } });
  return best;
}

function addOneDayISO(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0,10);
}

// Somme les mm enregistres dans une carte {date: mm} entre deux dates ISO incluses
function sumRain(joursMap, startISO, endISO) {
  let total = 0;
  Object.keys(joursMap || {}).forEach(d => { if (d >= startISO && d <= endISO) total += (joursMap[d] || 0); });
  return total;
}

// Recupere les precipitations quotidiennes (mm) entre startISO et endISO (inclus) pour un point GPS.
// Utilise la Historical Forecast API d'Open-Meteo pour toute la partie passee : elle rejoue les
// sorties archivees des modeles haute resolution (AROME France ~1,5-2,5km, contre 9-25km pour l'ancienne
// API archive ERA5), disponible depuis fin 2022 — largement suffisant pour couvrir une campagne depuis
// le 1er janvier. Les tout derniers jours (pas encore dans l'archive historique) restent recuperes via
// l'API prevision standard.
async function fetchDailyPrecip(lat, lon, startISO, endISO) {
  if (!startISO || startISO > endISO) return {};
  const results = {};
  const todayISO = new Date().toISOString().slice(0,10);
  const recentCutoff = new Date(); recentCutoff.setDate(recentCutoff.getDate() - 2);
  const recentCutoffISO = recentCutoff.toISOString().slice(0,10);

  // Partie historique (Historical Forecast API, resolution Meteo-France AROME)
  const histEndISO = recentCutoffISO < endISO ? recentCutoffISO : endISO;
  if (startISO <= histEndISO) {
    const url1 = 'https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&start_date=' + startISO + '&end_date=' + histEndISO + '&daily=precipitation_sum&timezone=auto';
    const res1 = await fetch(url1);
    if (!res1.ok) throw new Error('API historique : reponse HTTP ' + res1.status);
    const d1 = await res1.json();
    if (!d1.daily || !d1.daily.time) throw new Error('API historique : reponse inattendue');
    (d1.daily.time || []).forEach((d,i) => { if (d >= startISO && d <= endISO) results[d] = d1.daily.precipitation_sum[i] || 0; });
  }

  // Tout derniers jours (pas encore dans l'archive historique) : API prevision standard
  const recentStartISO = histEndISO >= startISO ? addOneDayISO(histEndISO) : startISO;
  if (recentStartISO <= endISO) {
    const days = Math.min(92, Math.max(1, Math.round((new Date(todayISO) - new Date(recentStartISO)) / 86400000) + 2));
    const url2 = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&daily=precipitation_sum&past_days=' + days + '&forecast_days=1&timezone=auto';
    const res2 = await fetch(url2);
    if (!res2.ok) throw new Error('API prevision : reponse HTTP ' + res2.status);
    const d2 = await res2.json();
    if (!d2.daily || !d2.daily.time) throw new Error('API prevision : reponse inattendue');
    (d2.daily.time || []).forEach((d,i) => {
      if (d >= recentStartISO && d <= endISO) results[d] = d2.daily.precipitation_sum[i] || 0;
    });
  }
  return results;
}

// Synchronise (une fois par connexion) l'historique quotidien de pluie de chaque site,
// stocke dans exploitations/{id}/pluviometrie/{siteKey}_{annee}, en ne recuperant que
// les jours manquants depuis la derniere synchronisation.
let rainfallSyncPromises = {}; // une promesse par exploitation (evite qu'une synchro pour la mauvaise exploitation reste figee)
function ensureRainfallSync() {
  const eid = S.currentId;
  if (!eid) return Promise.resolve({ ok: false });
  if (!rainfallSyncPromises[eid]) {
    rainfallSyncPromises[eid] = syncRainfallHistory(eid)
      .then(() => ({ ok: true }))
      .catch(e => {
        console.error('Erreur synchronisation pluviometrie', e);
        delete rainfallSyncPromises[eid]; // on ne fige pas l'echec : la prochaine tentative reessaiera
        return { ok: false, error: e };
      });
  }
  return rainfallSyncPromises[eid];
}
export function resetRainfallSync() { rainfallSyncPromises = {}; S.pluvioData = {}; }
// Oublie la synchro d'UNE SEULE exploitation (contrairement a resetRainfallSync qui oublie tout) :
// utilise par listenExploit() quand la liste des sites meteo d'une exploitation change.
// rainfallSyncPromises est une variable interne au module (pas exportee) : on passe par cette
// fonction plutot que de la manipuler directement depuis index.html.
export function forgetRainfallSync(eid) { delete rainfallSyncPromises[eid]; }

async function syncRainfallHistory(eid) {
  if (!eid) return;
  const sites = getSitesMeteo();
  if (!sites.length) return;
  S.pluvioData = S.pluvioData || {};
  const todayISO = new Date().toISOString().slice(0,10);
  const yearStr = todayISO.slice(0,4);
  const jan1ISO = yearStr + '-01-01';
  for (const site of sites) {
    const docId = site.key + '_' + yearStr;
    let existingJours = {};
    try {
      const snap = await getDoc(subdoc(eid, 'pluviometrie', docId));
      if (snap.exists()) existingJours = snap.data().jours || {};
    } catch(e) { console.error('Lecture historique pluviometrie', site.key, e); }
    const storedDates = Object.keys(existingJours).sort();
    const lastStored = storedDates.length ? storedDates[storedDates.length - 1] : null;
    const startFetch = lastStored ? addOneDayISO(lastStored) : jan1ISO;
    let newJours = {};
    if (startFetch <= todayISO) {
      // Pas de try/catch ici : une erreur doit remonter pour permettre un nouvel essai
      // au prochain appel, plutot que d'afficher silencieusement 0 mm en cas d'echec.
      newJours = await fetchDailyPrecip(site.coords.lat, site.coords.lon, startFetch, todayISO);
    }
    const merged = Object.assign({}, existingJours, newJours);
    S.pluvioData[site.key] = { label: site.label, jours: merged };
    if (Object.keys(newJours).length) {
      try {
        await setDoc(subdoc(eid, 'pluviometrie', docId),
          { site: site.key, label: site.label, annee: yearStr, jours: merged, updatedAt: serverTimestamp() },
          { merge: true });
      } catch(e) { console.error('Ecriture historique pluviometrie', site.key, e); }
    }
  }
}

// Fonction generique : affiche, dans l'element cible, le cumul de pluie par site
// depuis le dernier traitement (si un traitement existe cette campagne) et depuis
// le 1er janvier. cardElId (optionnel, tableau de bord) est masque uniquement en
// l'absence de site meteo configure.
function renderRainfallBlock(targetElId, cardElId) {
  const el = document.getElementById(targetElId);
  if (!el) return;
  const card = cardElId ? document.getElementById(cardElId) : null;
  const eidAtCall = S.currentId; // pour detecter un changement d'exploitation pendant l'attente async
  const sites = getSitesMeteo();
  if (!sites.length) {
    if (card) card.style.display = 'none';
    else el.innerHTML = '<span style="font-size:12px;color:var(--gris);">Aucun site meteo configure — ajoutez une commune dans la fiche exploitation.</span>';
    return;
  }
  if (card) card.style.display = '';
  const refDate = getLastPhytoDate();
  el.innerHTML = '<span style="font-size:12px;color:var(--gris);">Chargement...</span>';
  ensureRainfallSync().then(result => {
    if (S.currentId !== eidAtCall) return; // l'exploitation a change avant la fin de la synchro : on n'affiche pas ces donnees obsoletes
    const el2 = document.getElementById(targetElId);
    if (!el2) return;
    if (result && result.ok === false) {
      el2.innerHTML = '<span style="font-size:12px;color:var(--rouge);">Impossible de recuperer la pluviometrie pour le moment (reseau ou service meteo indisponible). Nouvel essai a la prochaine consultation.</span>';
      return;
    }
    const todayISO = new Date().toISOString().slice(0,10);
    const rows = sites.map(s => {
      const data = S.pluvioData[s.key] || { jours: {} };
      let ligneTraitement = '<span style="color:var(--gris);font-size:12px;">Aucun traitement enregistre cette campagne.</span>';
      if (refDate) {
        const refISO = toISO(refDate);
        const depuisTraitement = sumRain(data.jours, refISO, todayISO);
        ligneTraitement = '<span style="color:var(--vert);font-weight:600;">' + depuisTraitement.toFixed(1) + ' mm</span> depuis le dernier traitement (' + refDate + ')';
      }
      return '<div style="margin:4px 0;font-size:13px;"><strong>' + s.label + '</strong><br>' +
        ligneTraitement + '</div>';
    }).join('');
    el2.innerHTML = rows;
  });
}

export function renderRainfallCard() { renderRainfallBlock('rainfall-content', 'rainfall-card'); }

// Alimente la stat-card "Pluviometrie" du tableau de bord : cumul depuis le 1er janvier
// pour UNE station precise (jamais une moyenne, peu justifiee vu les variations locales
// de pluvio d'une station a l'autre). S'il y a plusieurs sites configures sur l'exploitation,
// un appui sur la carte fait defiler les stations disponibles ; le choix est memorise
// par exploitation (localStorage), comme la derniere exploitation consultee.
function pluvioStationPrefKey(eid) { return 'pluvioStationSite_' + eid; }
function getPluvioStationKey() {
  const sites = getSitesMeteo();
  if (!sites.length) return null;
  let saved = null;
  try { saved = localStorage.getItem(pluvioStationPrefKey(S.currentId)); } catch(e) {}
  if (saved && sites.some(s => s.key === saved)) return saved;
  return sites[0].key;
}
function setPluvioStationKey(key) {
  try { localStorage.setItem(pluvioStationPrefKey(S.currentId), key); } catch(e) {}
}

window.cyclePluvioStation = function() {
  const sites = getSitesMeteo();
  if (sites.length < 2) return; // un seul site (ou aucun) : rien a faire defiler
  const current = getPluvioStationKey();
  const idx = sites.findIndex(s => s.key === current);
  const next = sites[(idx + 1) % sites.length];
  setPluvioStationKey(next.key);
  renderPluvioStat();
};

export function renderPluvioStat() {
  const statEl = document.getElementById('stat-pluvio');
  const siteEl = document.getElementById('stat-pluvio-site');
  const card = document.getElementById('pluvio-stat-card');
  if (!statEl) return;
  const eidAtCall = S.currentId;
  const sites = getSitesMeteo();
  if (!sites.length) {
    statEl.textContent = '-';
    if (siteEl) siteEl.textContent = '';
    if (card) card.style.cursor = 'default';
    return;
  }
  if (card) card.style.cursor = sites.length > 1 ? 'pointer' : 'default';
  const siteKey = getPluvioStationKey();
  const site = sites.find(s => s.key === siteKey) || sites[0];
  statEl.textContent = '...';
  if (siteEl) siteEl.textContent = site.label;
  ensureRainfallSync().then(result => {
    if (S.currentId !== eidAtCall) return;
    const el = document.getElementById('stat-pluvio');
    if (!el) return;
    if (result && result.ok === false) { el.textContent = '?'; return; }
    const todayISO = new Date().toISOString().slice(0,10);
    const jan1ISO = todayISO.slice(0,4) + '-01-01';
    const total = sumRain((S.pluvioData[site.key]||{jours:{}}).jours, jan1ISO, todayISO);
    el.textContent = total.toFixed(0);
  });
}

// ── PAGE PLUVIOMETRIE DETAILLEE ──────────────────────────────
// Vue "Quotidien" (barres) et "Cumule" (courbe, comparee a l'annee precedente sur la
// meme periode) pour un site et une annee choisis. Reutilise les documents Firestore
// exploitations/{id}/pluviometrie/{siteKey}_{annee} deja alimentes par la synchro/l'import CSV.
export function renderPluvioPage() {
  const sites = getSitesMeteo();
  const controls = document.getElementById('pluvio-page-controls');
  const statsEl = document.getElementById('pluvio-page-stats');
  const chartEl = document.getElementById('pluvio-page-chart');
  if (!sites.length) {
    controls.innerHTML = '';
    statsEl.innerHTML = '';
    chartEl.innerHTML = '<div class="empty"><div class="empty-icon">🌧️</div><div class="empty-text">Aucun site meteo configure — ajoutez une commune dans la fiche exploitation.</div></div>';
    return;
  }
  if (!S.pluvioPage.siteKey || !sites.some(s => s.key === S.pluvioPage.siteKey)) {
    S.pluvioPage.siteKey = getPluvioStationKey(); // reprend la meme preference que le pave du tableau de bord
  }
  if (!S.pluvioPage.year) S.pluvioPage.year = String(new Date().getFullYear());
  S.pluvioPage.mois = null; // on revient toujours sur la vue annuelle a l'ouverture de la page

  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentYear; y >= currentYear - 4; y--) yearOptions.push(String(y));

  controls.innerHTML =
    (sites.length > 1 ?
      '<select id="pv-site-sel" onchange="onPluvioPageSiteChange()" style="border:1px solid var(--gris-m);border-radius:var(--r-sm);padding:9px 14px;font-size:14px;color:var(--vert);font-weight:600;background:var(--blanc);cursor:pointer;">' +
        sites.map(s => '<option value="' + s.key + '"' + (s.key === S.pluvioPage.siteKey ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('') +
      '</select>' : '') +
    '<select id="pv-year-sel" onchange="onPluvioPageYearChange()" style="border:1px solid var(--gris-m);border-radius:var(--r-sm);padding:9px 14px;font-size:14px;color:var(--vert);font-weight:600;background:var(--blanc);cursor:pointer;">' +
      yearOptions.map(y => '<option value="' + y + '"' + (y === S.pluvioPage.year ? ' selected' : '') + '>' + y + '</option>').join('') +
    '</select>';

  chartEl.innerHTML = '<span style="font-size:12px;color:var(--gris);">Chargement...</span>';
  statsEl.innerHTML = '';

  const site = sites.find(s => s.key === S.pluvioPage.siteKey);
  const year = S.pluvioPage.year;
  Promise.all([
    loadPluvioYearData(site.key, year),
    loadPluvioYearData(site.key, String(parseInt(year, 10) - 1))
  ]).then(([jours, joursPrec]) => {
    if (document.getElementById('page-pluviometrie').classList.contains('active') === false) return; // page quittee entre temps
    S.pluvioPage.cache = { siteKey: site.key, year, jours, joursPrec };
    renderPluvioPageStats(jours, joursPrec, year);
    drawPluvioPageChart(jours, joursPrec, year);
  });
}

// Recupere les jours {date: mm} d'un site pour une annee. L'annee en cours passe par le
// cache memoire deja synchronise (ensureRainfallSync) pour eviter une lecture Firestore en double.
async function loadPluvioYearData(siteKey, year) {
  const eid = S.currentId;
  if (year === String(new Date().getFullYear())) {
    await ensureRainfallSync();
    return (S.pluvioData[siteKey] || { jours: {} }).jours;
  }
  try {
    const snap = await getDoc(subdoc(eid, 'pluviometrie', siteKey + '_' + year));
    return snap.exists() ? (snap.data().jours || {}) : {};
  } catch (e) { console.error('Lecture pluviometrie', siteKey, year, e); return {}; }
}

window.onPluvioPageSiteChange = function() {
  S.pluvioPage.siteKey = document.getElementById('pv-site-sel').value;
  renderPluvioPage();
};
window.onPluvioPageYearChange = function() {
  S.pluvioPage.year = document.getElementById('pv-year-sel').value;
  renderPluvioPage();
};
window.setPluvioPageView = function(view) {
  S.pluvioPage.view = view;
  S.pluvioPage.mois = null; // repart sur la vue annuelle a chaque changement d'onglet
  document.getElementById('pvtab-mensuel').classList.toggle('active', view === 'mensuel');
  document.getElementById('pvtab-cumule').classList.toggle('active', view === 'cumule');
  const c = S.pluvioPage.cache;
  if (c) drawPluvioPageChart(c.jours, c.joursPrec, c.year); // redessine sans requete Firestore, les donnees sont deja en memoire
};

// Bascule vers le detail quotidien d'un mois (clic sur une barre mensuelle), et retour a la vue annuelle
window.drillPluvioMonth = function(mois) {
  S.pluvioPage.mois = mois;
  const c = S.pluvioPage.cache;
  if (c) drawPluvioPageChart(c.jours, c.joursPrec, c.year);
};
window.pluvioRetourAnnee = function() {
  S.pluvioPage.mois = null;
  const c = S.pluvioPage.cache;
  if (c) drawPluvioPageChart(c.jours, c.joursPrec, c.year);
};

function renderPluvioPageStats(jours, joursPrec, year) {
  const statsEl = document.getElementById('pluvio-page-stats');
  const isCurrentYear = year === String(new Date().getFullYear());
  const todayISO = new Date().toISOString().slice(0, 10);
  const janISO = year + '-01-01';
  const endISO = isCurrentYear ? todayISO : (year + '-12-31');
  const total = sumRain(jours, janISO, endISO);

  let deltaHtml = '';
  if (joursPrec && Object.keys(joursPrec).length) {
    const prevYear = parseInt(year, 10) - 1;
    const endISOPrec = prevYear + endISO.slice(4); // meme jour-mois, annee precedente (comparaison a periode egale)
    const totalPrec = sumRain(joursPrec, prevYear + '-01-01', endISOPrec);
    const delta = total - totalPrec;
    const sign = delta >= 0 ? '+' : '';
    deltaHtml = '<div><div style="font-size:11px;color:var(--gris);">vs ' + prevYear + ' (meme periode)</div><div style="font-size:15px;font-weight:700;color:' + (delta >= 0 ? 'var(--vert)' : 'var(--rouge)') + ';">' + sign + delta.toFixed(0) + ' mm</div></div>';
  }

  statsEl.innerHTML =
    '<div><div style="font-size:11px;color:var(--gris);">Cumul depuis le 1er janvier</div><div style="font-size:20px;font-weight:700;color:var(--vert);">' + total.toFixed(0) + ' mm</div></div>' +
    deltaHtml;
}

function drawPluvioPageChart(jours, joursPrec, year) {
  const chartEl = document.getElementById('pluvio-page-chart');
  if (S.pluvioPage.view === 'mensuel') {
    if (S.pluvioPage.mois) drawPluvioJourMois(chartEl, jours, year, S.pluvioPage.mois);
    else drawPluvioMensuel(chartEl, jours, year);
  } else {
    drawPluvioCumule(chartEl, jours, joursPrec, year);
  }
}

function joursAnnee(year, endISO) {
  const janISO = year + '-01-01';
  const dates = [];
  let d = new Date(janISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  while (d <= end) { dates.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return dates;
}

// Dernier jour du mois "mois" (1-12) d'une annee donnee, au format ISO.
function dernierJourMoisISO(year, mois) {
  const d = new Date(parseInt(year, 10), mois, 0); // jour 0 du mois suivant = dernier jour du mois vise
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

const NOMS_MOIS = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];

// Vue par defaut : un total par mois sur toute l'annee, tient sur un ecran de telephone sans defilement.
// Cliquer sur un mois bascule sur le detail quotidien de ce mois (drawPluvioJourMois).
function drawPluvioMensuel(chartEl, jours, year) {
  const isCurrentYear = year === String(new Date().getFullYear());
  const todayISO = new Date().toISOString().slice(0, 10);
  const dernierMois = isCurrentYear ? (parseInt(todayISO.slice(5, 7), 10)) : 12;
  const totaux = [];
  for (let m = 1; m <= dernierMois; m++) {
    const startISO = year + '-' + String(m).padStart(2, '0') + '-01';
    let endISO = dernierJourMoisISO(year, m);
    if (isCurrentYear && m === dernierMois && todayISO < endISO) endISO = todayISO;
    totaux.push(sumRain(jours, startISO, endISO));
  }
  const max = Math.max(1, ...totaux);
  const bars = totaux.map((v, i) => {
    const m = i + 1;
    const h = v > 0 ? Math.max(3, Math.round((v / max) * 100)) : 0;
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;cursor:pointer;min-width:0;" onclick="drillPluvioMonth(' + m + ')">' +
      '<div style="font-size:10px;color:var(--vert);font-weight:600;">' + v.toFixed(0) + '</div>' +
      '<div style="width:100%;height:110px;display:flex;align-items:flex-end;justify-content:center;padding:0 2px;"><div style="width:70%;height:' + h + '%;background:var(--vert-l);border-radius:3px 3px 0 0;"></div></div>' +
      '<div style="font-size:10px;color:var(--gris);margin-top:4px;">' + NOMS_MOIS[i].slice(0, 3) + '</div>' +
    '</div>';
  }).join('');
  chartEl.innerHTML =
    '<div style="display:flex;align-items:flex-end;gap:2px;">' + bars + '</div>' +
    '<div style="font-size:11px;color:var(--gris);margin-top:8px;">Toucher un mois pour le detail quotidien</div>';
}

// Detail quotidien d'un seul mois (declenche par un clic sur une barre mensuelle) : le nombre
// de barres reste faible (<=31), donc tient sur la largeur de l'ecran sans defilement.
function drawPluvioJourMois(chartEl, jours, year, mois) {
  const isCurrentYear = year === String(new Date().getFullYear());
  const todayISO = new Date().toISOString().slice(0, 10);
  const startISO = year + '-' + String(mois).padStart(2, '0') + '-01';
  let endISO = dernierJourMoisISO(year, mois);
  const isMoisEnCours = isCurrentYear && parseInt(todayISO.slice(5, 7), 10) === mois;
  if (isMoisEnCours && todayISO < endISO) endISO = todayISO;
  const dates = [];
  let d = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  while (d <= end) { dates.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  const values = dates.map(iso => jours[iso] || 0);
  const max = Math.max(1, ...values);
  const bars = dates.map((iso, i) => {
    const v = values[i];
    const h = v > 0 ? Math.max(3, Math.round((v / max) * 100)) : 0;
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;min-width:0;" title="' + iso + ' : ' + v.toFixed(1) + ' mm">' +
      '<div style="width:100%;height:100px;display:flex;align-items:flex-end;justify-content:center;"><div style="width:60%;height:' + h + '%;background:var(--vert-l);border-radius:2px 2px 0 0;"></div></div>' +
      '<div style="font-size:9px;color:var(--gris);margin-top:2px;">' + parseInt(iso.slice(8, 10), 10) + '</div>' +
    '</div>';
  }).join('');
  chartEl.innerHTML =
    '<div style="margin-bottom:8px;"><a href="javascript:void(0)" onclick="pluvioRetourAnnee()" style="font-size:12px;color:var(--vert);font-weight:600;">← Annee</a> <span style="font-size:13px;font-weight:700;margin-left:8px;">' + NOMS_MOIS[mois - 1] + ' ' + year + '</span></div>' +
    '<div style="display:flex;align-items:flex-end;gap:1px;">' + bars + '</div>';
}

// Courbe cumulee (SVG, sans dependance externe) : annee selectionnee en trait plein,
// annee precedente en pointille sur la meme periode calendaire, pour visualiser un
// deficit/exces hydrique par rapport a l'annee passee (a defaut d'une normale sur 30 ans, non disponible).
// Reperes ordonnee (mm, a gauche) et abscisse (mois, en dessous) ajoutes en HTML a cote du SVG
// plutot que dans le SVG lui-meme, pour eviter toute deformation du texte due au stretch horizontal
// (viewBox etire en largeur variable via preserveAspectRatio="none").
function drawPluvioCumule(chartEl, jours, joursPrec, year) {
  const isCurrentYear = year === String(new Date().getFullYear());
  const todayISO = new Date().toISOString().slice(0, 10);
  const endISO = isCurrentYear ? todayISO : (year + '-12-31');
  const dates = joursAnnee(year, endISO);
  let cum = 0;
  const cumValues = dates.map(iso => { cum += (jours[iso] || 0); return cum; });

  let cumPrecValues = null;
  if (joursPrec && Object.keys(joursPrec).length) {
    const prevYear = String(parseInt(year, 10) - 1);
    let dp = new Date(prevYear + '-01-01T00:00:00');
    let cumP = 0;
    cumPrecValues = dates.map(() => {
      const iso = dp.toISOString().slice(0, 10);
      cumP += (joursPrec[iso] || 0);
      dp.setDate(dp.getDate() + 1);
      return cumP;
    });
  }

  const W = 600, H = 140, pad = 4;
  const n = dates.length;
  const maxVal = Math.max(1, ...cumValues, ...(cumPrecValues || [0]));
  const toPoints = arr => arr.map((v, i) => {
    const x = n > 1 ? (i / (n - 1)) * (W - 2 * pad) + pad : pad;
    const y = H - pad - (v / maxVal) * (H - 2 * pad);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  const svg =
    '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:150px;display:block;" preserveAspectRatio="none">' +
    (cumPrecValues ? '<polyline points="' + toPoints(cumPrecValues) + '" fill="none" stroke="var(--gris-m)" stroke-width="2" stroke-dasharray="4,3"/>' : '') +
    '<polyline points="' + toPoints(cumValues) + '" fill="none" stroke="var(--vert)" stroke-width="2.5"/>' +
    '</svg>';

  // Reperes ordonnee : 5 paliers repartis entre 0 et le maximum affiche
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map(f => Math.round(maxVal * f));
  const yLabels = '<div style="display:flex;flex-direction:column;justify-content:space-between;height:150px;font-size:10px;color:var(--gris);padding-right:6px;text-align:right;">' +
    yTicks.map(v => '<span>' + v + '</span>').join('') + '</div>';

  // Reperes abscisse : un repere par mois, positionne en % de la largeur totale (proportionnel au nombre de jours)
  let xLabels = '';
  for (let m = 1; m <= 12; m++) {
    const mISO = year + '-' + String(m).padStart(2, '0') + '-01';
    const idx = dates.indexOf(mISO);
    if (idx === -1) continue;
    const pct = n > 1 ? (idx / (n - 1)) * 100 : 0;
    xLabels += '<span style="position:absolute;left:' + pct.toFixed(1) + '%;font-size:10px;color:var(--gris);">' + ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][m - 1] + '</span>';
  }

  const legend =
    '<div style="display:flex;gap:14px;font-size:11px;color:var(--gris);margin-top:6px;">' +
      '<span>— ' + year + '</span>' +
      (cumPrecValues ? '<span>┄ ' + (parseInt(year, 10) - 1) + '</span>' : '') +
    '</div>';

  chartEl.innerHTML =
    '<div style="display:flex;gap:4px;">' +
      yLabels +
      '<div style="flex:1;min-width:0;">' + svg + '<div style="position:relative;height:14px;margin-top:2px;">' + xLabels + '</div></div>' +
    '</div>' + legend;
}


// ── SITES METEO (communes suivies pour la pluviometrie) ──
export function renderSitesMeteoSection() {
  const sites = S.sitesMeteoByExploit[S.currentId] || [];
  return '<div style="margin-top:14px;border-top:1px solid var(--gris-l);padding-top:14px;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
      '<div style="font-size:12px;font-weight:700;color:var(--vert);text-transform:uppercase;letter-spacing:.5px;">🌧️ Sites meteo (pluviometrie)</div>' +
      '<div style="display:flex;gap:6px;">' +
        '<button class="btn btn-secondary btn-sm" onclick="openImportCsvModal()">📥 Importer CSV</button>' +
        '<button class="btn btn-primary btn-sm" onclick="openSiteMeteoModal(null)">+ Ajouter</button>' +
      '</div>' +
    '</div>' +
    (sites.length === 0 ?
      '<div style="font-size:12px;color:var(--gris);opacity:.6;">Aucune commune suivie — ajoutez-en une pour voir la pluviometrie sur le tableau de bord.</div>' :
      '<div style="display:flex;flex-direction:column;gap:6px;">' +
      sites.map(s => '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--gris-l);border-radius:var(--r-sm);">' +
          '<div>' +
            '<div style="font-weight:600;font-size:13px;">' + esc(s.nom) + (s.cp ? ' (' + esc(s.cp) + ')' : '') + '</div>' +
            '<div style="font-size:11px;color:var(--gris);">' + s.lat.toFixed(4) + ', ' + s.lon.toFixed(4) + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:4px;">' +
            '<button class="btn btn-icon edt" onclick="openSiteMeteoModal(\'' + s.id + '\')" title="Modifier">✏️</button>' +
            '<button class="btn btn-icon del" onclick="delSiteMeteo(\'' + s.id + '\',\'' + s.nom + '\')" title="Supprimer">🗑️</button>' +
          '</div>' +
        '</div>').join('') +
      '</div>'
    ) +
  '</div>';
}

window.openSiteMeteoModal = function(sid) {
  const s = sid ? (S.sitesMeteoByExploit[S.currentId] || []).find(x => x.id === sid) : null;
  const body =
    '<div class="form-grid">' +
      '<div class="form-group full"><label>Commune *</label><input type="text" id="fsm-nom" value="' + (s?s.nom:'') + '" placeholder="ex: Chablis"></div>' +
      '<div class="form-group"><label>Code postal</label><input type="text" id="fsm-cp" value="' + (s?s.cp||'':'') + '" placeholder="ex: 89800"></div>' +
      '<div class="form-group"><button type="button" class="btn btn-secondary btn-sm" style="margin-top:22px;" onclick="geocodeSiteMeteo()">🔍 Rechercher les coordonnees</button></div>' +
    '</div>' +
    '<div id="fsm-gps-status" style="margin-top:6px;font-size:12px;color:var(--gris);">' +
      (s ? 'Coordonnees actuelles : ' + s.lat.toFixed(4) + ', ' + s.lon.toFixed(4) : 'Renseignez la commune puis cliquez sur Rechercher.') +
    '</div>' +
    '<input type="hidden" id="fsm-lat" value="' + (s?s.lat:'') + '">' +
    '<input type="hidden" id="fsm-lon" value="' + (s?s.lon:'') + '">';
  openModal(s ? 'Modifier le site meteo' : 'Nouveau site meteo', body, () => saveSiteMeteo(sid));
};

// Geocodage via l'API Adresse du gouvernement francais (gratuite, sans cle)
window.geocodeSiteMeteo = async function() {
  const nom = document.getElementById('fsm-nom').value.trim();
  const cp = document.getElementById('fsm-cp').value.trim();
  const status = document.getElementById('fsm-gps-status');
  if (!nom) { toast('Renseignez le nom de la commune', true); return; }
  status.innerHTML = '<span style="color:var(--gris);">Recherche en cours...</span>';
  try {
    const q = encodeURIComponent(nom + (cp ? ' ' + cp : ''));
    const url = 'https://api-adresse.data.gouv.fr/search/?q=' + q + '&type=municipality&limit=1';
    const res = await fetch(url);
    if (!res.ok) throw new Error('reponse HTTP ' + res.status);
    const data = await res.json();
    const feat = data.features && data.features[0];
    if (!feat) { status.innerHTML = '<span style="color:var(--rouge);">Commune introuvable, verifiez l orthographe.</span>'; return; }
    const [lon, lat] = feat.geometry.coordinates;
    document.getElementById('fsm-lat').value = lat;
    document.getElementById('fsm-lon').value = lon;
    status.innerHTML = '<span style="color:var(--vert);">✓ ' + feat.properties.label + ' — ' + lat.toFixed(4) + ', ' + lon.toFixed(4) + '</span>';
  } catch(e) {
    status.innerHTML = '<span style="color:var(--rouge);">Erreur de geocodage : ' + e.message + '</span>';
  }
};

async function saveSiteMeteo(sid) {
  const nom = document.getElementById('fsm-nom').value.trim();
  const cp = document.getElementById('fsm-cp').value.trim();
  const lat = parseFloat(document.getElementById('fsm-lat').value);
  const lon = parseFloat(document.getElementById('fsm-lon').value);
  if (!nom) { toast('Nom de la commune requis', true); return; }
  if (Number.isNaN(lat) || Number.isNaN(lon)) { toast('Coordonnees manquantes — cliquez sur Rechercher', true); return; }
  const data = { nom, cp, lat, lon };
  try {
    if (sid) await setDoc(subdoc(S.currentId, 'sitesMeteo', sid), data, {merge:true});
    else await addDoc(sub(S.currentId, 'sitesMeteo'), data);
    closeModal(); toast('Site meteo enregistre');
  } catch(e) { toast('Erreur : ' + e.message, true); }
}

window.delSiteMeteo = function(id, nom) {
  confirm2('Supprimer "' + nom + '" ?', 'L historique de pluie deja enregistre pour ce site restera dans la base mais ne sera plus affiche.', async () => {
    await deleteDoc(subdoc(S.currentId, 'sitesMeteo', id));
    toast('Site meteo supprime');
  });
};

// ── IMPORT CSV PLUVIOMETRIE (releves de stations locales, plus precis qu'Open-Meteo) ──
// Format attendu (export type station meteo perso) : separateur ";", dates JJ/MM/AAAA,
// une colonne "<NOM STATION> Pluies quotidiennes (mm)" par station suivie (+ une colonne
// "Precipitations cumulees (mm)" ignoree, le cumul est recalcule par l'appli). Les valeurs
// importees ECRASENT celles deja stockees pour les memes jours dans exploitations/{id}/pluviometrie
// (source station jugee plus fiable qu'Open-Meteo) ; les jours non couverts par l'import restent
// inchanges. Voir STRUCTURE.md.
window.openImportCsvModal = function() {
  S.csvImportParsed = null;
  const body =
    '<div style="font-size:12px;color:var(--gris);margin-bottom:10px;">Importez un export CSV de vos stations locales. Les valeurs remplaceront celles d\'Open-Meteo pour les memes jours.</div>' +
    '<div class="form-group full"><label>Fichier CSV</label><input type="file" id="csv-file-input" accept=".csv,text/csv" onchange="handleCsvFileSelect(event)"></div>' +
    '<div class="form-group full"><label>Ou collez le contenu ici</label><textarea id="csv-paste-input" rows="6" placeholder="date;&quot;FONTAINE Pluies quotidiennes (mm)&quot;;...&#10;01/01/2026;0;..."></textarea></div>' +
    '<div id="csv-analyse-status" style="font-size:12px;color:var(--gris);margin-top:8px;"></div>' +
    '<div id="csv-mapping-zone"></div>' +
    '<button type="button" class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="analyserCsvImport()">🔍 Analyser le fichier</button>';
  openModal('Importer pluviometrie (CSV station)', body, null);
  document.getElementById('modal-save-btn').style.display = 'none';
};

window.handleCsvFileSelect = function(evt) {
  const file = evt.target.files && evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { document.getElementById('csv-paste-input').value = reader.result; };
  reader.onerror = () => toast('Erreur de lecture du fichier', true);
  reader.readAsText(file, 'UTF-8');
};

// Parse le texte CSV -> { stations:[{label, colIndex}], rows:[{iso, values:{label:mm}}] }
function parseCsvPluvio(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length);
  if (lines.length < 2) throw new Error('Fichier vide ou incomplet');
  const header = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').trim());
  const stations = [];
  header.forEach((h, idx) => {
    const m = h.match(/^(.+?)\s+Pluies quotidiennes/i);
    if (m) stations.push({ label: m[1].trim(), colIndex: idx });
  });
  if (!stations.length) throw new Error('Aucune colonne "Pluies quotidiennes" reconnue dans l\'en-tete');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(';');
    const iso = toISO(cells[0]);
    if (!iso) continue;
    const values = {};
    stations.forEach(s => { values[s.label] = parseFloat((cells[s.colIndex] || '0').replace(',', '.')) || 0; });
    rows.push({ iso, values });
  }
  if (!rows.length) throw new Error('Aucune ligne de donnees exploitable');
  return { stations, rows };
}

window.analyserCsvImport = function() {
  const text = document.getElementById('csv-paste-input').value;
  const status = document.getElementById('csv-analyse-status');
  if (!text || !text.trim()) { status.innerHTML = '<span style="color:var(--rouge);">Selectionnez un fichier ou collez le contenu du CSV.</span>'; return; }
  let parsed;
  try { parsed = parseCsvPluvio(text); }
  catch (e) { status.innerHTML = '<span style="color:var(--rouge);">Erreur : ' + esc(e.message) + '</span>'; return; }
  S.csvImportParsed = parsed;
  const sites = S.sitesMeteoByExploit[S.currentId] || [];
  const dates = parsed.rows.map(r => r.iso).sort();
  status.innerHTML = '<span style="color:var(--vert);">✓ ' + parsed.stations.length + ' station(s) detectee(s), ' + parsed.rows.length + ' jours (' + dates[0] + ' → ' + dates[dates.length - 1] + ')</span>';
  const zone = document.getElementById('csv-mapping-zone');
  zone.innerHTML = '<div style="margin-top:12px;font-size:12px;font-weight:700;color:var(--vert);text-transform:uppercase;">Correspondance avec vos sites meteo</div>' +
    parsed.stations.map((s, idx) => {
      // Auto-detection : egalite normalisee, sinon inclusion partielle dans un sens ou l'autre
      // (ex : "FONTAINE" dans le CSV <-> "Fontaine Denis" configure dans l'appli)
      const ns = normText(s.label);
      let best = sites.find(site => normText(site.nom) === ns);
      if (!best) best = sites.find(site => normText(site.nom).includes(ns) || ns.includes(normText(site.nom)));
      const options = '<option value="">— Ignorer cette colonne —</option>' +
        sites.map(site => '<option value="' + site.id + '"' + (best && best.id === site.id ? ' selected' : '') + '>' + esc(site.nom) + '</option>').join('');
      return '<div class="form-group full" style="margin-top:6px;"><label>' + esc(s.label) + '</label>' +
        '<select id="csv-map-' + idx + '">' + options + '</select></div>';
    }).join('');
  const btn = document.getElementById('modal-save-btn');
  btn.style.display = '';
  btn.textContent = 'Importer';
  btn.onclick = confirmerImportCsv;
};

async function confirmerImportCsv() {
  const parsed = S.csvImportParsed;
  if (!parsed) return;
  const sites = S.sitesMeteoByExploit[S.currentId] || [];
  const mapping = parsed.stations.map((s, idx) => {
    const sel = document.getElementById('csv-map-' + idx);
    const siteId = sel ? sel.value : '';
    return siteId ? { label: s.label, site: sites.find(x => x.id === siteId) } : null;
  }).filter(Boolean);
  if (!mapping.length) { toast('Selectionnez au moins un site a importer', true); return; }
  loading(true);
  try {
    // Sites meteo des AUTRES exploitations : on va les chercher directement en base (getDocs),
    // plutot que de compter sur S.sitesMeteoByExploit qui n'est peuple que pour les exploitations
    // deja activees au moins une fois durant la session en cours. Sans ca, une exploitation jamais
    // consultee depuis le dernier rechargement de la page etait silencieusement ignoree lors de
    // l'import, meme si elle possede un site du meme nom (bug identifie le 20/07/2026).
    const autresExploitations = S.exploitations.filter(ex => ex.id !== S.currentId);
    const sitesAutres = {}; // { exploitationId: [sites...] }
    for (const ex of autresExploitations) {
      const snap = await getDocs(sub(ex.id, 'sitesMeteo'));
      sitesAutres[ex.id] = snap.docs.map(d => ({id: d.id, ...d.data()}));
    }

    const exploitsTouchees = new Set();
    for (const m of mapping) {
      // Regroupe les jours importes par annee (un document pluviometrie par site + annee)
      const parYear = {};
      parsed.rows.forEach(r => {
        const val = r.values[m.label];
        if (val === undefined) return;
        const y = r.iso.slice(0, 4);
        (parYear[y] = parYear[y] || {})[r.iso] = val;
      });
      // Ecrit dans l'exploitation active, PUIS dans toute autre exploitation possedant un site
      // meteo du meme nom (station de reference partagee entre plusieurs exploitations proches,
      // ex. CORRE/VADEZ) : un seul import CSV met a jour toutes les exploitations concernees,
      // au lieu de forcer un import manuel par exploitation.
      const cibles = [{ eid: S.currentId, siteId: m.site.id }];
      const nomNorm = normText(m.site.nom);
      autresExploitations.forEach(ex => {
        const correspondance = (sitesAutres[ex.id] || []).find(s => normText(s.nom) === nomNorm);
        if (correspondance) cibles.push({ eid: ex.id, siteId: correspondance.id });
      });
      for (const [year, jours] of Object.entries(parYear)) {
        for (const cible of cibles) {
          const docId = cible.siteId + '_' + year;
          const existingSnap = await getDoc(subdoc(cible.eid, 'pluviometrie', docId));
          const existingJours = existingSnap.exists() ? (existingSnap.data().jours || {}) : {};
          // Les valeurs importees (station) ecrasent celles deja stockees (Open-Meteo) pour les memes jours
          const merged = Object.assign({}, existingJours, jours);
          await setDoc(subdoc(cible.eid, 'pluviometrie', docId),
            { site: cible.siteId, label: m.site.nom, annee: year, jours: merged, updatedAt: serverTimestamp() },
            { merge: true });
          exploitsTouchees.add(cible.eid);
        }
      }
    }
    autresExploitations.forEach(ex => { if (exploitsTouchees.has(ex.id)) forgetRainfallSync(ex.id); });
    resetRainfallSync();
    closeModal();
    render();
    toast('Pluviometrie importee (' + mapping.length + ' site(s), ' + exploitsTouchees.size + ' exploitation(s))');
  } catch (e) {
    toast('Erreur import : ' + e.message, true);
  } finally {
    loading(false);
  }
}
