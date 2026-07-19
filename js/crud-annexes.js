// ── PARCELLES / EXPLOITATIONS / APPLICATEURS ────────────────
// Module extrait le 19/07/2026 (etape 7 de la modularisation, voir STRUCTURE.md).
//
// Exporte : renderParcelles, renderExploitations (utilisees par index.html/render()).
//
// render(), openModal(), closeModal(), showPage(), listenExploit() restent dans index.html :
// appeles ici tels quels, resolus via window (meme convention que les modules precedents).

import { getDocs, addDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { esc, fmtDate, confirm2, toast } from './utils.js';
import { S, CULTURES_AGRICOLE, getEx } from './state.js';
import { sub, subdoc, baseCol, baseDoc, exploitsCol, exploitDoc } from './firebase-data.js';
import { renderSitesMeteoSection, resetRainfallSync } from './pluviometrie.js';

export function renderParcelles() {
  const el = document.getElementById('parcelles-list');
  if (!S.parcelles.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🗺</div><div class="empty-text">Aucune parcelle</div></div>';
    return;
  }
  const total = S.parcelles.reduce((s,p) => s + (parseFloat(p.surface)||0), 0);
  el.innerHTML =
    '<div class="parcelle-section-title">' +
      '<div class="pst-label">Parcelles enregistrees</div>' +
      '<div class="pst-stats">' +
        '<div class="pst-stat"><div class="pst-stat-val">' + S.parcelles.length + '</div><div class="pst-stat-lbl">parcelles</div></div>' +
        '<div class="pst-sep"></div>' +
        '<div class="pst-stat"><div class="pst-stat-val">' + total.toFixed(2) + '</div><div class="pst-stat-lbl">hectares</div></div>' +
      '</div>' +
    '</div>' +
    S.parcelles.map(p => {
      const ex2 = getEx();
      const infos = [];
      if (p.surface) infos.push(p.surface + ' ha');
      if (ex2 && ex2.type === 'agricole' && p.culture) infos.push(p.culture);
      if (p.ville) infos.push(p.ville);
      if (p.commune) infos.push('INSEE : ' + p.commune);
      if (p.ilot) infos.push('Ilot ' + p.ilot);
      if (p.gps) infos.push(p.gps);
      return '<div class="parcelle-item">' +
        '<div class="parcelle-left">' +
          '<div class="parcelle-nom">' + esc(p.nom) + '</div>' +
          (infos.length ? '<div class="parcelle-info">' + esc(infos.join(' · ')) + '</div>' : '') +
        '</div>' +
        '<div class="parcelle-actions">' +
          '<button class="btn btn-icon edt" onclick="openParcelleModal(\'' + p.id + '\')" title="Modifier">&#9998;</button>' +
          '<button class="btn btn-icon del" onclick="delParcelle(\'' + p.id + '\',\'' + p.nom + '\')" title="Supprimer">&#128465;</button>' +
        '</div>' +
      '</div>';
    }).join('');
}


export function renderExploitations() {
  const el = document.getElementById('exploit-list');
  if (!S.exploitations.length) {
    el.innerHTML = '<div class="empty"><div class="empty-text">Aucune exploitation</div></div>';
    return;
  }
  // La derniere exploitation consultee (active) est affichee en premier ; l'ordre des autres est conserve.
  const sorted = [...S.exploitations].sort((a,b) => {
    if (a.id === S.currentId) return -1;
    if (b.id === S.currentId) return 1;
    return 0;
  });
  el.innerHTML = sorted.map(e =>
    '<div class="exploit-card ' + (e.id === S.currentId ? 'active-exploit' : '') + '">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;">' +
        '<div>' +
          '<div class="exploit-nom">' + esc(e.nom) + '</div>' +
          '<div class="exploit-siret">SIRET : ' + esc(e.siret||'Non renseigne') + '</div>' +
          '<div class="exploit-siret">Certiphyto : ' + esc(e.certiphyto||'-') + (e.certiphytoDate ? ' &mdash; val. ' + fmtDate(e.certiphytoDate) + (new Date(e.certiphytoDate) < new Date() ? ' <span style="color:var(--rouge);font-weight:700;">EXPIRE</span>' : '') : '') + '</div>' +
        '</div>' +
        (e.id === S.currentId ? '<span class="badge badge-vert">Active</span>' : '') +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">' +
        '<span class="badge ' + (e.type==='agricole' ? 'badge-ocre' : 'badge-vert') + '">' + (e.type==='agricole' ? 'Agricole' : 'Viticole') + '</span>' +
        '<span class="badge badge-gris">' + (e.surface||0) + ' ha</span>' +
        (e.ab ? '<span class="badge badge-vert">Agriculture Biologique</span>' : '') +
      '</div>' +
      '<div class="exploit-actions">' +
        (e.id !== S.currentId ? '<button class="btn btn-primary btn-sm" onclick="switchExploit(\'' + e.id + '\')">Activer</button>' : '') +
        (e.id === S.currentId ? '<button class="btn btn-secondary btn-sm" onclick="showPage(\'parcelles\')">🗺️ Gerer les parcelles</button>' : '') +
        '<button class="btn btn-icon edt" onclick="openExploitModal(\'' + e.id + '\')" title="Modifier">✏️</button>' +
        '<button class="btn btn-icon del" onclick="delExploit(\'' + e.id + '\',\'' + e.nom + '\')" title="Supprimer">🗑️</button>' +
      '</div>' +
      // Section applicateurs uniquement pour l'exploitation active
      (e.id === S.currentId ? renderApplicateursSection() : '') +
      (e.id === S.currentId ? renderSitesMeteoSection() : '') +
    '</div>'
  ).join('');
}


// ── PARCELLE ─────────────────────────────────────────────────
window.openParcelleModal = function(pid) {
  const p = pid ? S.parcelles.find(x => x.id === pid) : null;
  const ex = getEx();
  const isAgri = ex && ex.type === 'agricole';
  const cultOpts = isAgri ? S.cultures.map(cu =>
    '<option value="' + cu.nom + '"' + (p && p.culture === cu.nom ? ' selected' : '') + '>' + cu.nom + '</option>'
  ).join('') : '';
  const body =
    '<div class="form-grid">' +
      '<div class="form-group full"><label>Nom de la parcelle</label><input type="text" id="fpar-nom" value="' + (p?p.nom:'') + '" placeholder="LES PARADIS" style="text-transform:uppercase;"></div>' +
      (isAgri ? '<div class="form-group full"><label>Culture en cours (' + S.campagne + ')</label><select id="fpar-culture"><option value="">-- Choisir --</option>' + cultOpts + '</select></div>' : '') +
      '<div class="form-group"><label>Surface (ha)</label><input type="number" id="fpar-surf" step="0.01" value="' + (p?p.surface||'':'') + '" placeholder="0.00"></div>' +
      '<div class="form-group"><label>N Ilot RPG</label><input type="text" id="fpar-ilot" value="' + (p?p.ilot||'':'') + '"></div>' +
'<div class="form-group"><label>Nom de la commune</label><input type="text" id="fpar-ville" value="' + (p?p.ville||'':'') + '" placeholder="ex: Vertus"></div>' +
      '<div class="form-group"><label>Code INSEE</label><input type="text" id="fpar-com" value="' + (p?p.commune||'':'') + '" placeholder="ex: 51606"></div>' +
      '<div class="form-group full"><label>Coordonnees GPS</label><input type="text" id="fpar-gps" value="' + (p?p.gps||'':'') + '" placeholder="48.123, 3.456"></div>' +
    '</div>';
  openModal(p ? 'Modifier la parcelle' : 'Nouvelle parcelle', body, () => saveParcelle(pid));
};

async function saveParcelle(pid) {
  const nom = document.getElementById('fpar-nom').value.toUpperCase().trim();
  if (!nom) { toast('Nom requis', true); return; }
  const cultEl = document.getElementById('fpar-culture');
  const data = {nom, culture: cultEl ? cultEl.value : '', surface:parseFloat(document.getElementById('fpar-surf').value)||0, ilot:document.getElementById('fpar-ilot').value, ville:document.getElementById('fpar-ville').value, commune:document.getElementById('fpar-com').value, gps:document.getElementById('fpar-gps').value};
  try {
    const eid = S.currentId;
    if (pid) await updateDoc(subdoc(eid,'parcelles',pid), data);
    else await addDoc(sub(eid,'parcelles'), data);
    closeModal(); toast('Parcelle enregistree');
  } catch(e) { toast('Erreur : ' + e.message, true); }
}

window.delParcelle = function(id, nom) {
  confirm2('Supprimer "' + nom + '" ?', 'Les passages existants ne seront pas modifies.', async () => {
    await deleteDoc(subdoc(S.currentId,'parcelles',id));
    toast('Parcelle supprimee');
  });
};

// ── EXPLOITATION ─────────────────────────────────────────────
window.openExploitModal = function(eid) {
  const e = eid ? S.exploitations.find(x => x.id === eid) : null;
  const isNew = !eid;
  const body =
    '<div class="form-grid">' +
      (isNew ? '<div class="form-group full"><label>Type d exploitation</label><select id="fe-type" onchange="onExploitTypeChange()" style="font-weight:600;color:var(--vert);"><option value="viticole">Viticole</option><option value="agricole">Agricole</option></select></div>' : '<input type="hidden" id="fe-type" value="' + (e?e.type||'viticole':'viticole') + '">') +
      '<div class="form-group full"><label>Raison sociale / Nom</label><input type="text" id="fe-nom" value="' + (e?e.nom:'') + '" placeholder="EI DUPONT Jean"></div>' +
      '<div class="form-group"><label>N SIRET (14 chiffres)</label><input type="text" id="fe-siret" maxlength="14" value="' + (e?e.siret||'':'') + '"></div>' +
      '<div class="form-group"><label>N Certiphyto</label><input type="text" id="fe-cert" value="' + (e?e.certiphyto||'':'') + '"></div>' +
      '<div class="form-group"><label>Validite Certiphyto</label><input type="date" id="fe-certdate" value="' + (e?e.certiphytoDate||'':'') + '"></div>' +
      '<div class="form-group"><label>Surface totale (ha)</label><input type="number" id="fe-surf" step="0.01" value="' + (e?e.surface||'':'') + '"></div>' +
      '<div class="form-group"><label>Agriculture Biologique</label><select id="fe-ab"><option value="false"' + (e&&!e.ab?' selected':'') + '>Non</option><option value="true"' + (e&&e.ab?' selected':'') + '>Oui</option></select></div>' +
    '</div>' +
    (isNew ? '<div id="fe-type-info" style="margin-top:10px;padding:10px 14px;background:var(--vert-xxl);border-radius:var(--r-sm);font-size:12px;color:var(--vert);">Base produits phytosanitaires viticole partagee (commune a toutes les exploitations viticoles) + stades phenologiques vigne.</div>' : '');
  openModal(e ? 'Modifier l exploitation' : 'Nouvelle exploitation', body, () => saveExploit(eid));
};

async function saveExploit(eid) {
  const nom = document.getElementById('fe-nom').value.trim();
  if (!nom) { toast('Nom requis', true); return; }
  const type = (document.getElementById('fe-type') ? document.getElementById('fe-type').value : null) || 'viticole';
  const data = {nom, type, siret:document.getElementById('fe-siret').value, certiphyto:document.getElementById('fe-cert').value, certiphytoDate:document.getElementById('fe-certdate').value||'', surface:parseFloat(document.getElementById('fe-surf').value)||0, ab:document.getElementById('fe-ab').value==='true'};
  try {
    if (eid) {
      await updateDoc(exploitDoc(eid), data);
      closeModal(); toast('Exploitation enregistree');
    } else {
      data.createdAt = serverTimestamp();
      const ref = await addDoc(exploitsCol(), data);
      S.currentId = ref.id;
      if (type === 'viticole') {
        // Verifier si la base viticole existe, sinon l'initialiser
        const baseCatSnap = await getDocs(baseCol('viticole','categories'));
        if (baseCatSnap.empty) {
          for (const cn of DEF_CATS_VITICOLE) await addDoc(baseCol('viticole','categories'), {nom:cn});
          for (const p of DEF_PRODUITS) await addDoc(baseCol('viticole','produits'), p);
        }
      } else {
        // Verifier si la base agricole existe, sinon l'initialiser
        const baseAgriSnap = await getDocs(baseCol('agricole','categories'));
        if (baseAgriSnap.empty) {
          for (const cn of DEF_CATS_AGRICOLE) await addDoc(baseCol('agricole','categories'), {nom:cn});
        }
        // Cultures propres a l'exploitation
        for (const cult of CULTURES_AGRICOLE) await addDoc(sub(ref.id,'cultures'), {nom:cult});
      }
      listenExploit();
      closeModal(); toast('Exploitation creee');
    }
  } catch(e) { toast('Erreur : ' + e.message, true); }
}

window.onExploitTypeChange = function() {
  const type = document.getElementById('fe-type').value;
  const info = document.getElementById('fe-type-info');
  if (!info) return;
  if (type === 'viticole') {
    info.textContent = 'Base produits phytosanitaires viticole partagee (commune a toutes les exploitations viticoles) + stades phenologiques vigne.';
  } else {
    info.textContent = 'Base produits phytosanitaires agricole partagee (commune a toutes les exploitations agricoles) + stades par culture (Ble, Orge, Colza, Tournesol, Mais).';
  }
};

function renderApplicateursSection() {
  const ex = getEx();
  if (!ex) return '';
  if (!S.applicateurs) S.applicateurs = [];
  return '<div style="margin-top:14px;border-top:1px solid var(--gris-l);padding-top:14px;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
      '<div style="font-size:12px;font-weight:700;color:var(--vert);text-transform:uppercase;letter-spacing:.5px;">Applicateurs / Prestataires</div>' +
      '<button class="btn btn-primary btn-sm" onclick="openApplicateurModal(null)">+ Ajouter</button>' +
    '</div>' +
    (S.applicateurs.length === 0 ?
      '<div style="font-size:12px;color:var(--gris);opacity:.6;">Aucun prestataire — l exploitation elle-meme est applicateur par defaut.</div>' :
      '<div style="display:flex;flex-direction:column;gap:6px;">' +
      S.applicateurs.map(a => {
        const expire = a.certiphytoDate && new Date(a.certiphytoDate) < new Date();
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--gris-l);border-radius:var(--r-sm);">' +
          '<div>' +
            '<div style="font-weight:600;font-size:13px;">' + esc(a.nom) + (expire ? ' <span style="color:var(--rouge);font-size:11px;">⚠ Certiphyto expire</span>' : '') + '</div>' +
            '<div style="font-size:11px;color:var(--gris);">SIRET : ' + esc(a.siret||'-') + ' &nbsp;·&nbsp; Certiphyto : ' + esc(a.certiphyto||'-') + (a.certiphytoDate ? ' (val. ' + fmtDate(a.certiphytoDate) + ')' : '') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:4px;">' +
            '<button class="btn btn-icon edt" onclick="openApplicateurModal(\'' + a.id + '\')" title="Modifier">✏️</button>' +
            '<button class="btn btn-icon del" onclick="delApplicateur(\'' + a.id + '\',\'' + a.nom + '\')" title="Supprimer">🗑️</button>' +
          '</div>' +
        '</div>';
      }).join('') +
      '</div>'
    ) +
  '</div>';
}

// ── MODAL APPLICATEUR ──
window.openApplicateurModal = function(aid) {
  const a = aid ? S.applicateurs.find(x => x.id === aid) : null;
  const body =
    '<div class="form-grid">' +
      '<div class="form-group full"><label>Nom du prestataire *</label><input type="text" id="fa-nom" value="' + (a?a.nom:'') + '" placeholder="ex: EARL DUPONT"></div>' +
      '<div class="form-group"><label>N SIRET (14 chiffres)</label><input type="text" id="fa-siret" maxlength="14" value="' + (a?a.siret||'':'') + '"></div>' +
      '<div class="form-group"><label>N Certiphyto</label><input type="text" id="fa-cert" value="' + (a?a.certiphyto||'':'') + '"></div>' +
      '<div class="form-group full"><label>Date de validite Certiphyto</label><input type="date" id="fa-certdate" value="' + (a?a.certiphytoDate||'':'') + '"></div>' +
    '</div>';
  openModal(a ? 'Modifier applicateur' : 'Nouvel applicateur', body, () => saveApplicateur(aid));
};

async function saveApplicateur(aid) {
  const nom = document.getElementById('fa-nom').value.trim();
  if (!nom) { toast('Nom requis', true); return; }
  const ex = getEx();
  const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
  const data = {nom, siret:document.getElementById('fa-siret').value, certiphyto:document.getElementById('fa-cert').value, certiphytoDate:document.getElementById('fa-certdate').value||''};
  try {
    if (aid) await setDoc(baseDoc(btype,'applicateurs',aid), data, {merge:true});
    else await addDoc(baseCol(btype,'applicateurs'), data);
    closeModal(); toast('Applicateur enregistre');
  } catch(e) { toast('Erreur : ' + e.message, true); }
}

window.delApplicateur = function(id, nom) {
  confirm2('Supprimer "' + nom + '" ?', 'Cet applicateur sera retire de la liste. Les passages existants ne sont pas modifies.', async () => {
    const ex = getEx();
    const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
    await deleteDoc(baseDoc(btype,'applicateurs',id));
    toast('Applicateur supprime');
  });
};

window.switchExploit = function(id) {
  if (id === S.currentId) return;
  S.currentId = id;
  try { localStorage.setItem('derniereExploitationId', id); } catch(e) {}
  S.datesRecolte = {}; // Reset en memoire, Firebase va repeupler via listener
  resetRainfallSync();
  listenExploit();
  toast('Exploitation activee');
};

window.delExploit = function(id, nom) {
  if (S.exploitations.length <= 1) { toast('Impossible de supprimer la derniere exploitation', true); return; }
  confirm2('Supprimer "' + nom + '" ?', 'Attention : les donnees (passages, produits, parcelles) restent dans Firebase mais l exploitation sera retiree de la liste.', async () => {
    await deleteDoc(exploitDoc(id));
    if (S.currentId === id) {
      const other = S.exploitations.find(e => e.id !== id);
      if (other) { S.currentId = other.id; try { localStorage.setItem('derniereExploitationId', other.id); } catch(e) {} listenExploit(); }
    }
    toast('Exploitation supprimee');
  });
};
