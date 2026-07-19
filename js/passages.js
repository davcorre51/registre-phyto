// ── PASSAGES (phyto + engrais) ──────────────────────────────
// Module extrait le 19/07/2026 (etape 6 de la modularisation, voir STRUCTURE.md).
//
// Exporte : renderPassages, updatePassagesActions (utilisees par index.html/render()).
//
// render(), openModal(), closeModal(), switchExploit() restent dans index.html : appeles ici
// tels quels, resolus via window (meme convention que pluviometrie.js et produits-stock.js).

import { addDoc, deleteDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { esc, fmtDate, toISO, addDaysToDate, confirm2, toast } from './utils.js';
import { S, UNITES, STADES_VITICOLE, STADES_AGRICOLE, getEx, calcIFT, nextPassageNum, yearOf } from './state.js';
import { sub, subdoc } from './firebase-data.js';
import { applyConsommation } from './produits-stock.js';

window.showPassagesView = function(view) {
  document.getElementById('psubtab-phyto').classList.toggle('active', view==='phyto');
  document.getElementById('psubtab-engrais').classList.toggle('active', view==='engrais');
  S.passagesView = view;
  render();
};

export function updatePassagesActions() {
  const el = document.getElementById('passages-actions');
  if (!el) return;
  el.innerHTML = S.passagesView === 'engrais'
    ? '<button class="btn btn-primary btn-sm" onclick="openPassageEngraisModal(null)">+ Ajouter</button>'
    : '<button class="btn btn-primary btn-sm" onclick="openPassageModal(null)">+ Ajouter</button>';
}

export function renderPassages(cp) {
  const el = document.getElementById('passages-list');
  if (!cp || !cp.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Aucun passage - cliquez sur + Ajouter</div></div>';
    return;
  }
  el.innerHTML = [...cp].sort((a,b) => toISO(b.date).localeCompare(toISO(a.date))).map(p => {
    const isEng = p.type === 'engrais';
    let bodyHTML, rightBadge = '';
    if (isEng) {
      const engs = p.engraisList || [];
      bodyHTML = engs.map(e => {
        const a = e.apportsCalcules || {};
        const apportsTxt = ['n','p','k','mgo','so3','fe'].map(k => a[k] ? k.toUpperCase()+':'+a[k] : null).filter(Boolean).join(' / ') || '-';
        return '<div class="prod-line"><span style="flex:1;font-weight:600;">' + esc(e.nom) + '</span><span style="flex:1;text-align:center;font-size:13px;color:var(--gris);">' + (e.qte ? '<strong>' + e.qte + '</strong> ' + esc(e.unite||'') : '') + '</span><span style="font-size:11px;color:var(--vert);min-width:120px;text-align:right;">' + esc(apportsTxt) + '</span></div>';
      }).join('') + (p.applicateurId ? '<div style="margin-top:6px;font-size:12px;color:var(--gris);">Applicateur : ' + esc(p.applicateurNom||'') + '</div>' : '') + (p.notes ? '<div style="margin-top:8px;font-size:12px;color:var(--gris);background:var(--gris-l);padding:8px;border-radius:6px;">' + esc(p.notes) + '</div>' : '');
      rightBadge = '';
    } else {
    const prods = p.produitsList || [];
    const byCat = {};
    prods.forEach(pr => { if (!byCat[pr.cat]) byCat[pr.cat] = []; byCat[pr.cat].push(pr); });
    bodyHTML = Object.entries(byCat).map(([cat,list]) =>
      '<div class="prod-cat-title">' + esc(cat) + '</div>' +
      list.map(pr => '<div class="prod-line"><span style="flex:1;font-weight:600;">' + esc(pr.nom) + '</span><span style="flex:1;text-align:center;font-size:13px;color:var(--gris);">' + (pr.qte ? '<strong>' + pr.qte + '</strong> ' + esc(pr.unite||'') : esc(pr.dose||'')) + '</span>' + (pr.dre ? '<span class="badge badge-rouge" style="font-size:10px;margin-left:auto;">DRE ' + pr.dre + 'h</span>' : '<span style="min-width:50px;"></span>') + '</div>').join('')
    ).join('') + (function(){ var pctTxt = (p.pourcentSurface && p.pourcentSurface < 100) ? p.pourcentSurface + '% de la surface traitee' : ''; var combined = [pctTxt, p.notes||''].filter(Boolean).join(' — '); return combined ? '<div style="margin-top:8px;font-size:12px;color:var(--gris);background:var(--gris-l);padding:8px;border-radius:6px;">' + esc(combined) + '</div>' : ''; })();
    rightBadge = (function(){
      try {
        var d = parseInt(p.dre,10) || 0;
        var m = (p.produitsList||[]).reduce(function(mx,pr){ return Math.max(mx, parseInt(pr.dre,10)||0); }, d);
        var v = m || d;
        var dreB = v ? '<span class="badge badge-rouge">DRE '+v+'h</span>' : '';
        var iftV = (p.ift!==undefined && p.ift!==null ? p.ift : calcIFT(p));
        var iftB = Number.isFinite(iftV) && iftV ? '<span class="badge" style="background:var(--vert-xxl);color:var(--vert);">IFT '+iftV.toFixed(2)+'</span>' : '';
        var pctB = (p.pourcentSurface && p.pourcentSurface < 100) ? '<span class="badge" style="background:#fff3cd;color:#8a6d00;">'+p.pourcentSurface+'% surface</span>' : '';
        var maxDar = (p.produitsList||[]).reduce(function(mx,pr){ return Math.max(mx, parseInt(pr.dar,10)||0); }, 0);
        var darB = '';
        if (maxDar) {
          var darSafeFR = addDaysToDate(p.date, maxDar);
          var darSafeISO = toISO(darSafeFR);
          var recolteISO = (S.datesRecolte && S.datesRecolte[S.campagne]) || '';
          var recolteConfirmee = !!(S.recoltesConfirmees && S.recoltesConfirmees[S.campagne]);
          var qualif = recolteConfirmee ? 'confirmee' : 'previsionnelle';
          if (recolteISO && darSafeISO > recolteISO) {
            var recolteFR = fmtDate(recolteISO);
            darB = '<span class="badge badge-rouge" title="Recolte '+qualif+' le '+recolteFR+' — recolte sans risque seulement a partir du '+darSafeFR+'">DAR NON</span>';
          } else if (recolteISO) {
            var recolteFR2 = fmtDate(recolteISO);
            darB = '<span class="badge" style="background:#e0f5e9;color:#1a7a45;" title="Recolte sans risque des '+darSafeFR+' (recolte '+qualif+' le '+recolteFR2+')">DAR OK</span>';
          } else {
            darB = '<span class="badge" style="background:#e7e0ff;color:#5b3fd4;" title="Recolte possible sans risque a partir de cette date, compte tenu du DAR le plus long des produits appliques">DAR : recolte des '+darSafeFR+'</span>';
          }
        }
        return dreB+iftB+pctB+darB;
      } catch(e) { console.error('Erreur affichage badge passage', p.id, e); return ''; }
    })();
    }

    return '<div class="passage-item">' +
      '<div class="passage-header" onclick="togglePBody(\'pb' + p.id + '\')">' +
        '<div class="passage-num">' + (p.num||'?') + '</div>' +
        '<div><div class="passage-date">' + fmtDate(p.date) + (p.heureDebut ? ' — ' + p.heureDebut : '') + '</div>' +
        '<div class="passage-meta">' + esc((p.parcelles||[]).join(', ')||'Toutes parcelles') + '</div></div>' +
        '<div class="passage-right"><div style="font-size:11px;color:var(--gris);text-align:right;max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(p.stade||'') + '</div>' +
        '<div style="display:flex;gap:4px;">' + rightBadge + '</div></div>' +
      '</div>' +
      '<div class="passage-body" id="pb' + p.id + '">' + (bodyHTML || '<span style="font-size:12px;color:var(--gris);">Aucun produit saisi.</span>') +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button class="btn btn-icon edt" onclick="' + (isEng ? 'openPassageEngraisModal' : 'openPassageModal') + '(\'' + p.id + '\')" title="Modifier">✏️</button>' +
          '<button class="btn btn-icon" onclick="duplicatePassage(\'' + p.id + '\')" title="Dupliquer">📄</button>' +
          (S.exploitations.length > 1 ? '<button class="btn btn-icon" onclick="ouvrirChoixDuplicationExploit(\'' + p.id + '\')" title="Dupliquer vers une autre exploitation">📤</button>' : '') +
          '<button class="btn btn-icon del" onclick="delPassage(\'' + p.id + '\')" title="Supprimer">🗑️</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// Duplique un passage vers une AUTRE exploitation : les produits/doses/dates sont repris,
// mais les parcelles sont effacees (elles ne correspondent pas forcement d'une exploitation a l'autre)
// et devront etre re-selectionnees par l'utilisateur dans le nouveau formulaire.
window.ouvrirChoixDuplicationExploit = function(id) {
  const autres = S.exploitations.filter(e => e.id !== S.currentId);
  if (!autres.length) { toast('Aucune autre exploitation disponible', true); return; }
  const body = '<div class="form-group"><label>Dupliquer vers</label><select id="dup-exploit-choix">' +
    autres.map(e => '<option value="' + e.id + '">' + e.nom + '</option>').join('') +
    '</select></div>' +
    '<div style="font-size:12px;color:var(--gris);margin-top:8px;">Les produits, doses et la date seront repris. Les parcelles ne sont pas reprises : a re-selectionner dans la nouvelle exploitation.</div>';
  openModal('Dupliquer vers une autre exploitation', body, () => {
    const targetId = document.getElementById('dup-exploit-choix').value;
    duplicatePassageVersExploit(id, targetId);
  });
};

window.duplicatePassageVersExploit = function(id, targetId) {
  const src = S.passages.find(x => x.id === id);
  if (!src) { toast('Passage introuvable', true); return; }
  const clone = JSON.parse(JSON.stringify(src));
  delete clone.id;
  clone.parcelles = [];
  clone.parcellesIds = [];
  const isEngrais = src.type === 'engrais';
  switchExploit(targetId);
  toast('Basculement vers la nouvelle exploitation...');
  setTimeout(() => {
    if (isEngrais) {
      clone.num = nextPassageNum('engrais');
      openPassageEngraisModal(null, clone);
    } else {
      clone.num = nextPassageNum('phyto');
      openPassageModal(null, clone);
    }
    toast('Passage duplique — selectionnez les parcelles et verifiez la date');
  }, 600);
};

// Extraire quantite et unite depuis une chaine "1.5 L/HA"
function extractQte(dose) {
  if (!dose) return '';
  const m = dose.match(/^([0-9.,]+)/);
  return m ? m[1].replace(',','.') : '';
}
function extractUnite(dose, defaut) {
  if (!dose) return defaut || 'L/HA';
  for (const u of UNITES) {
    if (dose.toUpperCase().includes(u)) return u;
  }
  return defaut || 'L/HA';
}

window.togglePill = function(pill) {
  pill.classList.toggle('active');
  if (pill.classList.contains('active')) {
    const qteEl = pill.querySelector('.pill-qte');
    const base = S.produits.find(p => p.nom === pill.dataset.nom && p.cat === pill.dataset.cat);
    if (qteEl && base && !qteEl.value) {
      qteEl.value = base.qte || extractQte(base.dose||'');
      const uniteEl = pill.querySelector('.pill-unite');
      if (uniteEl) uniteEl.value = base.unite || extractUnite(base.dose||'', 'L/HA');
    }
  }
  recalcDRE();
};

window.updateStadesFromCulture = function() {
  const cult = document.getElementById('f-culture');
  const stadeEl = document.getElementById('f-stade');
  if (!cult || !stadeEl) return;
  const stades = STADES_AGRICOLE[cult.value] || [];
  stadeEl.innerHTML = '<option value="">-- Choisir --</option>' + stades.map(s => '<option value="' + s + '">' + s + '</option>').join('');
};

function recalcDRE() {
  const actives = document.querySelectorAll('.prod-pill.active');
  let maxDre = 0;
  actives.forEach(pill => {
    const dre = parseInt(pill.dataset.dre) || 0;
    if (dre > maxDre) maxDre = dre;
  });
  const field = document.getElementById('f-dre');
  if (field) field.value = maxDre;
}

window.togglePctSurface = function() {
  const link = document.getElementById('pct-toggle-link');
  const wrap = document.getElementById('pct-surface-wrap');
  if (link) link.style.display = 'none';
  if (wrap) wrap.style.display = '';
};

window.insertGPSNotes = function() {
  const checks = document.querySelectorAll('.parc-cb:checked');
  const gpsLines = [];
  checks.forEach(cb => {
    const parc = S.parcelles.find(p => p.nom === cb.value);
    if (parc && parc.gps) gpsLines.push(parc.nom + ' : ' + parc.gps);
  });
  if (!gpsLines.length) {
    toast('Aucune coordonnee GPS sur les parcelles selectionnees', true);
    return;
  }
  const notes = document.getElementById('f-notes');
  if (!notes) return;
  const existing = notes.value.trim();
  const gpsText = 'GPS : ' + gpsLines.join(' | ');
  notes.value = existing ? existing + '\n' + gpsText : gpsText;
  toast('GPS inseres dans les notes');
};

window.insertGPSNotesEng = function() {
  const checks = document.querySelectorAll('.parc-cb-eng:checked');
  const gpsLines = [];
  checks.forEach(cb => {
    const parc = S.parcelles.find(p => p.nom === cb.value);
    if (parc && parc.gps) gpsLines.push(parc.nom + ' : ' + parc.gps);
  });
  if (!gpsLines.length) {
    toast('Aucune coordonnee GPS sur les parcelles selectionnees', true);
    return;
  }
  const notes = document.getElementById('fe-notes');
  if (!notes) return;
  const existing = notes.value.trim();
  const gpsText = 'GPS : ' + gpsLines.join(' | ');
  notes.value = existing ? existing + '\n' + gpsText : gpsText;
  toast('GPS inseres dans les notes');
};


// ── PLUVIOMETRIE ─────────────────────────────────────────────
// getSitesMeteo, sync Open-Meteo, rendu dashboard/page detaillee, sites meteo CRUD,
// import CSV : extraits vers js/pluviometrie.js le 19/07/2026 (etape 4 de la modularisation).
window.selectAllParcelles = function(checked) {
  document.querySelectorAll('.parc-cb').forEach(cb => cb.checked = checked);
};

window.togglePBody = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
};


window.openPassageModal = function(pid, dupData) {
  const p = dupData || (pid ? S.passages.find(x => x.id === pid) : null);
  const catNames = [...new Set([...S.categories.map(c=>c.nom), ...S.produits.map(pr=>pr.cat)])];
  const parOpts = S.parcelles.map(pa =>
    '<option value="' + pa.nom + '"' + (p && (p.parcelles||[]).includes(pa.nom) ? ' selected' : '') + '>' + esc(pa.nom) + '</option>'
  ).join('');

  const prodsHTML = catNames.map(cat => {
    const existing = p ? (p.produitsList||[]).filter(pr => pr.cat === cat) : [];
    const catProds = S.produits.filter(pr => pr.cat === cat && (pr.actif !== false || existing.some(e => e.nom === pr.nom))).sort((a,b) => (b.favori?1:0) - (a.favori?1:0));
    if (!catProds.length) return '';
    return '<div class="prod-pills-section">' +
      '<div class="prod-pills-title">' + esc(cat) + '</div>' +
      '<div class="prod-pills-grid">' +
      catProds.map(pr => {
        const sel = existing.find(e => e.nom === pr.nom);
        const isActive = !!sel;
        const selQte = sel ? (sel.qte !== undefined ? sel.qte : extractQte(sel.dose||'')) : (pr.qte || extractQte(pr.dose||''));
        const selUnite = sel ? (sel.unite || extractUnite(sel.dose||'', pr.unite||'L/HA')) : (pr.unite || 'L/HA');
        return '<div class="prod-pill' + (isActive ? ' active' : '') + '" data-cat="' + cat + '" data-nom="' + pr.nom + '" data-dre="' + (pr.dre||0) + '" data-amm="' + (pr.amm||'') + '" data-unite="' + selUnite + '" onclick="togglePill(this)">' +
          '<div class="prod-pill-name">' + (pr.favori ? '⭐ ' : '') + esc(pr.nom) + '</div>' +
          '<div class="prod-pill-dose" style="display:flex;align-items:center;gap:4px;">' +
            '<input type="number" class="pill-qte" step="0.01" value="' + (selQte||'') + '" placeholder="qte" onclick="event.stopPropagation()" style="width:60px;">' +
            '<select class="pill-unite" onclick="event.stopPropagation()" style="font-size:11px;padding:4px 5px;border:none;background:transparent;color:var(--vert);font-weight:600;cursor:pointer;">' +
              UNITES.map(u => '<option value="' + u + '"' + (u===selUnite?' selected':'') + '>' + u + '</option>').join('') +
            '</select>' +
          '</div>' +
        '</div>';
      }).join('') +
      '</div></div>';
  }).join('');

  const numVal = p ? p.num : nextPassageNum('phyto');
  const dreVal = p ? p.dre||0 : 0;
  const body =
    '<div style="display:flex;gap:12px;margin-bottom:12px;">' +
      '<div class="form-group" style="max-width:130px;"><label>Passage N (auto)</label><input type="number" id="f-num" value="' + numVal + '" readonly style="background:var(--vert-xxl);color:var(--vert);font-weight:600;"></div>' +
      '<div class="form-group" style="max-width:150px;"><label>DRE max (h) — auto</label><input type="number" id="f-dre" value="' + dreVal + '" readonly style="background:var(--vert-xxl);color:var(--vert);font-weight:600;"></div>' +
    '</div>' +
    '<div class="form-grid" style="margin-bottom:12px;">' +
      '<div class="form-group"><label>Campagne</label><input type="text" id="f-camp" value="' + (p ? yearOf(p) : S.campagne) + '"></div>' +
      '<div class="form-group"><label>Date</label><input type="date" id="f-date" value="' + (p ? toISO(p.date) : '') + '"></div>' +
      '<div class="form-group"><label>Heure debut (HH:MM)</label><input type="time" id="f-hdeb" value="' + (p ? p.heureDebut||'' : '') + '"></div>' +
      '<div class="form-group"><label>Heure fin (HH:MM)</label><input type="time" id="f-hfin" value="' + (p ? p.heureFin||'' : '') + '"></div>' +
    '</div>' +
    (function(){
      const ex = getEx();
      const isAgri = ex && ex.type === 'agricole';
      const cultOpts = isAgri ? S.cultures.map(cu =>
        '<option value="' + cu.nom + '"' + (p&&p.culture===cu.nom?' selected':'') + '>' + cu.nom + '</option>'
      ).join('') : '';
      const stadesSrc = isAgri ? (p&&p.culture ? (STADES_AGRICOLE[p.culture]||[]) : []) : STADES_VITICOLE;
      return (isAgri ?
        '<div class="form-group" style="margin-bottom:12px;">' +
          '<label>Culture</label>' +
          '<select id="f-culture" onchange="updateStadesFromCulture()">' +
            '<option value="">-- Choisir une culture --</option>' + cultOpts +
          '</select>' +
        '</div>' : '') +
      '<div class="form-group" style="margin-bottom:12px;">' +
        '<label>Stade phenologique</label>' +
        '<select id="f-stade"><option value="">-- Choisir --</option>' + stadesSrc.map(s => '<option value="' + s + '"' + (p&&p.stade===s?' selected':'') + '>' + s + '</option>').join('') + '</select>' +
      '</div>';
    })() +
    '<div style="margin-bottom:12px;">' +
      '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--gris);margin-bottom:6px;">Parcelles traitees</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="selectAllParcelles(true)">Toutes</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="selectAllParcelles(false)">Aucune</button>' +
      '</div>' +
      '<div id="parc-checks" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">' +
      S.parcelles.map(pa =>
        '<label style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--gris-l);border-radius:8px;cursor:pointer;font-size:13px;">' +
        '<input type="checkbox" class="parc-cb" value="' + pa.nom + '" data-id="' + pa.id + '"' + (p && (p.parcelles||[]).includes(pa.nom) ? ' checked' : '') + ' style="width:20px;height:20px;accent-color:var(--vert);cursor:pointer;flex-shrink:0;">' +
        esc(pa.nom) + '</label>'
      ).join('') +
      '</div>' +
      (function(){
        const pctVal = p && p.pourcentSurface ? p.pourcentSurface : 100;
        const partiel = pctVal !== 100;
        return '<div id="pct-toggle-link" style="margin-top:10px;' + (partiel?'display:none;':'') + '">' +
            '<button type="button" class="btn btn-secondary btn-sm" onclick="togglePctSurface()">Traitement partiel de la parcelle ?</button>' +
          '</div>' +
          '<div class="form-group" id="pct-surface-wrap" style="margin-top:10px;max-width:260px;' + (partiel?'':'display:none;') + '">' +
            '<label>% de la surface traitee (desherbage localise)</label>' +
            '<input type="number" id="f-pct-surface" min="1" max="100" value="' + pctVal + '">' +
          '</div>';
      })() +
    '</div>' +
    '<div class="section-title">Produits appliques</div>' +
    prodsHTML +

    '<div class="form-group" style="margin-top:10px;">' +
      '<label>Applicateur</label>' +
      '<select id="f-applicateur">' +
        '<option value="">— ' + (getEx()?getEx().nom:'Exploitation') + ' (par defaut) —</option>' +
        (S.applicateurs||[]).map(a => {
          const expire = a.certiphytoDate && new Date(a.certiphytoDate) < new Date();
          return '<option value="' + a.id + '"' + (p&&p.applicateurId===a.id?' selected':'') + (expire?' style="color:var(--rouge);"':'') + '>' + esc(a.nom) + (expire?' ⚠ EXPIRE':'') + '</option>';
        }).join('') +
      '</select>' +
    '</div>' +
    '<div class="form-group" style="margin-top:10px;"><label>Notes / observations</label><textarea id="f-notes" rows="3" placeholder="Conditions meteo...">' + esc(p?p.notes||'':'') + '</textarea></div>' +
    '<div style="margin-top:6px;"><button type="button" class="btn btn-secondary btn-sm" onclick="insertGPSNotes()">📍 Inserer GPS parcelles</button></div>';

  openModal(pid ? 'Modifier le passage' : (dupData ? 'Nouveau passage (duplique)' : 'Nouveau passage'), body, () => savePassage(pid));
};

function prodLineHTML(cat, existing, catProds) {
  const opts = catProds.map(p =>
    '<option value="' + p.nom + '" data-dose="' + (p.dose||'') + '" data-dre="' + (p.dre||0) + '"' + (existing&&existing.nom===p.nom?' selected':'') + '>' + esc(p.nom) + '</option>'
  ).join('');
  return '<div class="prod-form-row" data-cat="' + cat + '">' +
    '<select style="flex:2;" onchange="autoFillDose(this)" class="psel"><option value="">-- Produit --</option>' + opts + '</select>' +
    '<input type="text" placeholder="Dose" style="flex:1;min-width:70px;" class="pdose" value="' + (existing?existing.dose||'':'') + '">' +
    '<button type="button" class="btn btn-danger btn-icon" onclick="this.closest(\'.prod-form-row\').remove()" title="Retirer">✕</button>' +
  '</div>';
}

window.addProdLine = function(cat, ckey) {
  const catProds = S.produits.filter(p => p.cat === cat);
  const container = document.getElementById(ckey);
  if (!container) return;
  const div = document.createElement('div');
  div.innerHTML = prodLineHTML(cat, null, catProds);
  container.appendChild(div.firstElementChild);
};

window.autoFillDose = function(sel) {
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.dose) sel.nextElementSibling.value = opt.dataset.dose;
};

async function savePassage(pid) {
  const dateISO = document.getElementById('f-date').value;
  if (!dateISO) { toast('Veuillez indiquer une date', true); return; }
  const dateRaw = fmtDate(dateISO);
  const parcChecks = Array.from(document.querySelectorAll('.parc-cb:checked'));
  const parc = parcChecks.map(cb=>cb.value);
  const parcIds = parcChecks.map(cb=>cb.dataset.id||'');
  const prodsList = [];
  document.querySelectorAll('.prod-pill.active').forEach(pill => {
    const nom = pill.dataset.nom;
    const cat = pill.dataset.cat;
    const qteEl = pill.querySelector('.pill-qte');
    const uniteEl = pill.querySelector('.pill-unite');
    const base = S.produits.find(p => p.nom === nom && p.cat === cat);
    const qte = qteEl ? qteEl.value : '';
    const unite = uniteEl ? uniteEl.value : (base ? base.unite||'L/HA' : 'L/HA');
    const dose = qte ? (qte + ' ' + unite) : '';
    prodsList.push({nom, cat, dose, qte: parseFloat(qte)||0, unite, dre: base ? base.dre : 0, dar: base ? base.dar||0 : 0, amm: base ? base.amm||'' : '', doseReferenceIFT: base && base.doseReference!==null && base.doseReference!==undefined ? parseFloat(base.doseReference) : null});
  });
  const cultEl2 = document.getElementById('f-culture');
  const appSel2 = document.getElementById('f-applicateur');
  const appId2 = appSel2 ? appSel2.value : '';
  const appObj = appId2 ? S.applicateurs.find(a => a.id === appId2) : null;
  const data = {
    type: 'phyto',
    num: parseInt(document.getElementById('f-num').value)||1,
    campagne: document.getElementById('f-camp').value || S.campagne,
    culture: cultEl2 ? cultEl2.value : '',
    date: dateRaw,
    heureDebut: document.getElementById('f-hdeb').value,
    heureFin: document.getElementById('f-hfin').value,
    stade: document.getElementById('f-stade').value,
    dre: parseInt(document.getElementById('f-dre').value)||0,
    parcelles: parc,
    parcellesIds: parcIds,
    pourcentSurface: Math.min(100, Math.max(1, parseFloat(document.getElementById('f-pct-surface').value) || 100)),
    produitsList: prodsList,
    ift: (function(){ try { var pct = Math.min(100, Math.max(1, parseFloat(document.getElementById('f-pct-surface').value) || 100)); var v = calcIFT({type:'phyto', parcelles: parc, parcellesIds: parcIds, pourcentSurface: pct, produitsList: prodsList}); return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0; } catch(e) { console.error('Erreur calcul IFT', e); return 0; } })(),

    applicateurId: appId2 || '',
    applicateurNom: appObj ? appObj.nom : (getEx() ? getEx().nom : ''),
    applicateurSiret: appObj ? appObj.siret||'' : (getEx() ? getEx().siret||'' : ''),
    notes: document.getElementById('f-notes').value,
    updatedAt: serverTimestamp()
  };
  try {
    const eid = S.currentId;
    const oldData = pid ? S.passages.find(x => x.id === pid) : null;
    if (pid) await updateDoc(subdoc(eid,'passages',pid), data);
    else { data.createdAt = serverTimestamp(); await addDoc(sub(eid,'passages'), data); }
    if (oldData) await applyConsommation(oldData, -1); // retire l'ancienne consommation avant d'appliquer la nouvelle
    await applyConsommation(data, +1);
    closeModal(); toast('Passage enregistre');
  } catch(e) { toast('Erreur : ' + e.message, true); }
}

window.delPassage = function(id) {
  confirm2('Supprimer ce passage ?', 'Cette action est irreversible.', async () => {
    const oldData = S.passages.find(x => x.id === id);
    await deleteDoc(subdoc(S.currentId,'passages',id));
    if (oldData) await applyConsommation(oldData, -1);
    toast('Passage supprime');
  });
};

// Duplique un passage existant (phyto ou engrais) : ouvre un formulaire "Nouveau"
// pre-rempli avec les memes parcelles/produits, la date reste a verifier/modifier.
window.duplicatePassage = function(id) {
  const src = S.passages.find(x => x.id === id);
  if (!src) { toast('Passage introuvable', true); return; }
  const clone = JSON.parse(JSON.stringify(src));
  delete clone.id;
  if (src.type === 'engrais') {
    clone.num = nextPassageNum('engrais');
    openPassageEngraisModal(null, clone);
  } else {
    clone.num = nextPassageNum('phyto');
    openPassageModal(null, clone);
  }
  toast('Passage duplique — verifiez la date avant d\'enregistrer');
};

// ── PASSAGE ENGRAIS (formulaire dedie) ────────────────────────
window.openPassageEngraisModal = function(pid, dupData) {
  const p = dupData || (pid ? S.passages.find(x => x.id === pid && x.type === 'engrais') : null);
  const cats = [...new Set(S.engrais.map(eg => eg.categorie || 'Autre'))];
  const existingEng = p ? (p.engraisList||[]) : [];

  const engraisHTML = !S.engrais.length
    ? '<div class="empty" style="padding:20px;"><div class="empty-text">Aucun engrais dans la base — ajoutez-en depuis l\'onglet Produits.</div></div>'
    : cats.map(cat => {
        const catEngs = S.engrais.filter(eg => (eg.categorie||'Autre') === cat);
        const existing = existingEng.filter(eg => (eg.categorie||'Autre') === cat);
        return '<div class="prod-pills-section">' +
          '<div class="prod-pills-title">' + esc(cat) + '</div>' +
          '<div class="prod-pills-grid">' +
          catEngs.map(eg => {
            const sel = existing.find(e => e.nom === eg.nom);
            const isActive = !!sel;
            const selQte = sel ? sel.qte : eg.qte;
            const selUnite = sel ? sel.unite : (eg.unite || 'kg/ha');
            const c = eg.composition || {};
            return '<div class="prod-pill eng-pill' + (isActive ? ' active' : '') + '" data-cat="' + cat + '" data-nom="' + eg.nom + '" ' +
              'data-n="' + (c.n||0) + '" data-p="' + (c.p||0) + '" data-k="' + (c.k||0) + '" data-mgo="' + (c.mgo||0) + '" data-so3="' + (c.so3||0) + '" data-fe="' + (c.fe||0) + '" ' +
              'onclick="this.classList.toggle(\'active\')">' +
              '<div class="prod-pill-name">' + esc(eg.nom) + '</div>' +
              '<div class="prod-pill-dose" style="display:flex;align-items:center;gap:4px;">' +
                '<input type="number" class="pill-qte" step="0.01" value="' + (selQte||'') + '" placeholder="qte" onclick="event.stopPropagation()" style="width:60px;">' +
                '<select class="pill-unite" onclick="event.stopPropagation()" style="font-size:11px;padding:4px 5px;border:none;background:transparent;color:var(--vert);font-weight:600;cursor:pointer;">' +
                  '<option value="kg/ha"' + (selUnite==='kg/ha'?' selected':'') + '>kg/ha</option>' +
                  '<option value="L/ha"' + (selUnite==='L/ha'?' selected':'') + '>L/ha</option>' +
                '</select>' +
              '</div>' +
            '</div>';
          }).join('') +
          '</div></div>';
      }).join('');

  const numValEng = p ? p.num : nextPassageNum('engrais');
  const body =
    '<div style="display:flex;gap:12px;margin-bottom:12px;">' +
      '<div class="form-group" style="max-width:130px;"><label>Passage N (auto)</label><input type="number" id="fe-num" value="' + numValEng + '" readonly style="background:var(--vert-xxl);color:var(--vert);font-weight:600;"></div>' +
    '</div>' +
    '<div class="form-grid" style="margin-bottom:12px;">' +
      '<div class="form-group"><label>Campagne</label><input type="text" id="fe-camp" value="' + (p ? yearOf(p) : S.campagne) + '"></div>' +
      '<div class="form-group"><label>Date</label><input type="date" id="fe-date" value="' + (p ? toISO(p.date) : '') + '"></div>' +
    '</div>' +
    '<div style="margin-bottom:12px;">' +
      '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--gris);margin-bottom:6px;">Parcelles concernees</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="selectAllParcellesEng(true)">Toutes</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="selectAllParcellesEng(false)">Aucune</button>' +
      '</div>' +
      '<div id="parc-checks-eng" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">' +
      S.parcelles.map(pa =>
        '<label style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--gris-l);border-radius:8px;cursor:pointer;font-size:13px;">' +
        '<input type="checkbox" class="parc-cb-eng" value="' + pa.nom + '" data-id="' + pa.id + '"' + (p && (p.parcelles||[]).includes(pa.nom) ? ' checked' : '') + ' style="width:20px;height:20px;accent-color:var(--vert);cursor:pointer;flex-shrink:0;">' +
        esc(pa.nom) + '</label>'
      ).join('') +
      '</div>' +
    '</div>' +
    '<div class="section-title">Engrais appliques</div>' +
    engraisHTML +
    '<div class="form-group" style="margin-top:10px;">' +
      '<label>Applicateur</label>' +
      '<select id="fe-applicateur">' +
        '<option value="">— ' + (getEx()?getEx().nom:'Exploitation') + ' (par defaut) —</option>' +
        (S.applicateurs||[]).map(a => {
          const expire = a.certiphytoDate && new Date(a.certiphytoDate) < new Date();
          return '<option value="' + a.id + '"' + (p&&p.applicateurId===a.id?' selected':'') + (expire?' style="color:var(--rouge);"':'') + '>' + a.nom + (expire?' ⚠ EXPIRE':'') + '</option>';
        }).join('') +
      '</select>' +
    '</div>' +
    '<div class="form-group" style="margin-top:10px;"><label>Notes / observations</label><textarea id="fe-notes" rows="3" placeholder="Conditions, parcelle test...">' + esc(p?p.notes||'':'') + '</textarea></div>' +
    '<div style="margin-top:6px;"><button type="button" class="btn btn-secondary btn-sm" onclick="insertGPSNotesEng()">📍 Inserer GPS parcelles</button></div>';

  openModal(pid ? 'Modifier le passage engrais' : (dupData ? 'Nouveau passage engrais (duplique)' : 'Nouveau passage engrais'), body, () => savePassageEngrais(pid));
};

window.selectAllParcellesEng = function(val) {
  document.querySelectorAll('.parc-cb-eng').forEach(cb => cb.checked = val);
};

async function savePassageEngrais(pid) {
  const dateISO = document.getElementById('fe-date').value;
  if (!dateISO) { toast('Veuillez indiquer une date', true); return; }
  const dateRaw = fmtDate(dateISO);
  const parcChecksEng = Array.from(document.querySelectorAll('.parc-cb-eng:checked'));
  const parc = parcChecksEng.map(cb=>cb.value);
  const parcIds = parcChecksEng.map(cb=>cb.dataset.id||'');

  const engList = [];
  document.querySelectorAll('.eng-pill.active').forEach(pill => {
    const nom = pill.dataset.nom;
    const cat = pill.dataset.cat;
    const qteEl = pill.querySelector('.pill-qte');
    const uniteEl = pill.querySelector('.pill-unite');
    const qte = parseFloat(qteEl ? qteEl.value : 0) || 0;
    const unite = uniteEl ? uniteEl.value : 'kg/ha';
    const compoPct = {
      n: parseFloat(pill.dataset.n)||0, p: parseFloat(pill.dataset.p)||0,
      k: parseFloat(pill.dataset.k)||0, mgo: parseFloat(pill.dataset.mgo)||0,
      so3: parseFloat(pill.dataset.so3)||0, fe: parseFloat(pill.dataset.fe)||0
    };
    // Apport reel (kg/ha) = dose appliquee x % de composition / 100.
    // Hypothese : 1 L/ha ~ 1 kg/ha (densite proche de 1 pour la plupart des solutions engrais).
    const apportsCalcules = {};
    Object.keys(compoPct).forEach(k => { apportsCalcules[k] = Math.round(qte * compoPct[k] / 100 * 100) / 100; });
    engList.push({nom, categorie: cat, qte, unite, composition: compoPct, apportsCalcules});
  });

  if (!engList.length) { toast('Selectionnez au moins un engrais', true); return; }

  const appSelEng = document.getElementById('fe-applicateur');
  const appIdEng = appSelEng ? appSelEng.value : '';
  const appObjEng = appIdEng ? S.applicateurs.find(a => a.id === appIdEng) : null;

  const data = {
    type: 'engrais',
    num: parseInt(document.getElementById('fe-num').value)||1,
    campagne: document.getElementById('fe-camp').value || S.campagne,
    date: dateRaw,
    parcelles: parc,
    parcellesIds: parcIds,
    engraisList: engList,
    applicateurId: appIdEng || '',
    applicateurNom: appObjEng ? appObjEng.nom : (getEx() ? getEx().nom : ''),
    applicateurSiret: appObjEng ? appObjEng.siret||'' : (getEx() ? getEx().siret||'' : ''),
    notes: document.getElementById('fe-notes').value,
    updatedAt: serverTimestamp()
  };
  try {
    const eid = S.currentId;
    const oldData = pid ? S.passages.find(x => x.id === pid) : null;
    if (pid) await updateDoc(subdoc(eid,'passages',pid), data);
    else { data.createdAt = serverTimestamp(); await addDoc(sub(eid,'passages'), data); }
    if (oldData) await applyConsommation(oldData, -1);
    await applyConsommation(data, +1);
    closeModal(); toast('Passage engrais enregistre');
  } catch(e) { toast('Erreur : ' + e.message, true); }
}
