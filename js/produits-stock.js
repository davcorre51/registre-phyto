// ── PRODUITS / ENGRAIS / STOCK ──────────────────────────────
// Module extrait le 19/07/2026 (etape 5 de la modularisation, voir STRUCTURE.md).
//
// Exporte : renderProduits, renderEngrais, updateProduitsActions, applyConsommation,
// recalculerConsommation (utilisees par index.html/render() et par le futur passages.js).
//
// render(), openModal(), closeModal(), showPage() restent dans index.html (orchestrateur pas
// encore extrait) : appeles ici tels quels, resolus via window (voir pluviometrie.js pour
// la meme convention).

import { getDocs, addDoc, setDoc, deleteDoc, updateDoc, increment, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { esc, toast, loading, confirm2 } from './utils.js';
import { S, getEx, DEF_CATS_VITICOLE, DEF_PRODUITS, DEF_PARCELLES } from './state.js';
import { db, sub, baseCol, baseDoc } from './firebase-data.js';

// ── IMPORT PRODUITS DEPUIS EXCEL ────────────────────────────
const PRODUITS_EXCEL = [
  {
    "nom": "EPERON PEPITE",
    "cat": "Mildiou",
    "dre": 48,
    "amm": "",
    "dose": ""
  },
  {
    "nom": "ELECTIS BLEU",
    "cat": "Mildiou",
    "dre": 24,
    "amm": "",
    "dose": "1,96L/HA"
  },
  {
    "nom": "FORUM TOP",
    "cat": "Mildiou",
    "dre": 48,
    "amm": "",
    "dose": ""
  },
  {
    "nom": "KENKIO",
    "cat": "Mildiou",
    "dre": 6,
    "amm": "",
    "dose": ""
  },
  {
    "nom": "AMPHORE PEPITE",
    "cat": "Mildiou",
    "dre": 48,
    "amm": "",
    "dose": ""
  },
  {
    "nom": "PRIVEST",
    "cat": "Mildiou",
    "dre": 48,
    "amm": "",
    "dose": ""
  },
  {
    "nom": "FANTIC",
    "cat": "Mildiou",
    "dre": 48,
    "amm": "",
    "dose": "2KG/HA"
  },
  {
    "nom": "PEXIUM",
    "cat": "Mildiou",
    "dre": 48,
    "amm": "",
    "dose": "0,5KG/HA"
  },
  {
    "nom": "ZORVEC",
    "cat": "Mildiou",
    "dre": 48,
    "amm": "",
    "dose": "0,2L/HA"
  },
  {
    "nom": "FOLPAN",
    "cat": "Mildiou",
    "dre": 48,
    "amm": "",
    "dose": "1,25KG/HA"
  },
  {
    "nom": "VIDERYO",
    "cat": "Mildiou",
    "dre": 48,
    "amm": "",
    "dose": "2,5L/HA"
  },
  {
    "nom": "FUTURA",
    "cat": "Mildiou",
    "dre": 48,
    "amm": "",
    "dose": "4L/HA"
  },
  {
    "nom": "HELIOCUIVRE",
    "cat": "Mildiou",
    "dre": 48,
    "amm": "",
    "dose": "1L/HA"
  },
  {
    "nom": "THIOVIT JET",
    "cat": "Oidium",
    "dre": 6,
    "amm": "",
    "dose": ""
  },
  {
    "nom": "CYFLODIUIM",
    "cat": "Oidium",
    "dre": 24,
    "amm": "",
    "dose": ""
  },
  {
    "nom": "NATIVO",
    "cat": "Oidium",
    "dre": 48,
    "amm": "",
    "dose": ""
  },
  {
    "nom": "ALGEBRE",
    "cat": "Oidium",
    "dre": 6,
    "amm": "",
    "dose": ""
  },
  {
    "nom": "DYNALI",
    "cat": "Oidium",
    "dre": 6,
    "amm": "",
    "dose": ""
  },
  {
    "nom": "KARATHANE",
    "cat": "Oidium",
    "dre": 48,
    "amm": "",
    "dose": ""
  },
  {
    "nom": "MICROTHIOL",
    "cat": "Oidium",
    "dre": 6,
    "amm": "",
    "dose": "10KG/HA"
  },
  {
    "nom": "VIVANDO",
    "cat": "Oidium",
    "dre": 6,
    "amm": "",
    "dose": "0,2L/HA"
  },
  {
    "nom": "YARIS",
    "cat": "Oidium",
    "dre": 48,
    "amm": "",
    "dose": "0,15L/HA"
  },
  {
    "nom": "HOGGAR",
    "cat": "Oidium",
    "dre": 48,
    "amm": "",
    "dose": "0,6L/HA"
  },
  {
    "nom": "REVYVIT",
    "cat": "Oidium",
    "dre": 48,
    "amm": "",
    "dose": "2L/HA"
  },
  {
    "nom": "LUNA XTEND",
    "cat": "Oidium",
    "dre": 48,
    "amm": "",
    "dose": "0,2L/HA"
  },
  {
    "nom": "THIOPRON RAIN FREE",
    "cat": "Oidium",
    "dre": 48,
    "amm": "",
    "dose": "6,8L/HA"
  },
  {
    "nom": "REDELI",
    "cat": "Biocontrole / SDN",
    "dre": 0,
    "amm": "",
    "dose": "2,5L/Ha"
  },
  {
    "nom": "VINIVAX",
    "cat": "Biocontrole / SDN",
    "dre": 0,
    "amm": "",
    "dose": "1L/Ha"
  },
  {
    "nom": "INVELOP",
    "cat": "Biocontrole / SDN",
    "dre": 0,
    "amm": "",
    "dose": "10KG/HA"
  },
  {
    "nom": "STICMAN",
    "cat": "Adjuvants",
    "dre": 0,
    "amm": "",
    "dose": "0,14L/HL"
  },
  {
    "nom": "ISOTAC",
    "cat": "Adjuvants",
    "dre": 0,
    "amm": "",
    "dose": "0,3L/HL"
  },
  {
    "nom": "GEOXE",
    "cat": "Botrytis",
    "dre": 48,
    "amm": "",
    "dose": "1KG/HA"
  },
  {
    "nom": "NUTRIBIO FE",
    "cat": "Nutrition foliaire",
    "dre": 0,
    "amm": "",
    "dose": "3L/Ha"
  },
  {
    "nom": "VIVAFLOR",
    "cat": "Nutrition foliaire",
    "dre": 0,
    "amm": "",
    "dose": "3L/Ha"
  }
];

window.importProduitsExcel = async function() {
  if (!confirm('Importer ' + PRODUITS_EXCEL.length + ' produits depuis le fichier CAMPAGNE_PHYTO_Christine ? Les doublons (meme nom) seront ignores.')) return;
  loading(true);
  try {
    // S'assurer que les categories existent
    const baseCatsSnap = await getDocs(baseCol('viticole','categories'));
    const existCats = baseCatsSnap.docs.map(d => d.data().nom);
    const catsNeeded = [...new Set(PRODUITS_EXCEL.map(p => p.cat))];
    for (const cn of catsNeeded) {
      if (!existCats.includes(cn)) await addDoc(baseCol('viticole','categories'), {nom:cn});
    }
    // Importer les produits en evitant les doublons
    const baseProdsSnap = await getDocs(baseCol('viticole','produits'));
    const existProds = baseProdsSnap.docs.map(d => d.data().nom.toUpperCase());
    let nb = 0;
    for (const p of PRODUITS_EXCEL) {
      if (!existProds.includes(p.nom.toUpperCase())) {
        await addDoc(baseCol('viticole','produits'), p);
        nb++;
      }
    }
    loading(false);
    toast(nb + ' produits importes, ' + (PRODUITS_EXCEL.length - nb) + ' doublons ignores');
  } catch(e) {
    loading(false);
    toast('Erreur : ' + e.message, true);
  }
};

window.resetBaseViticole = async function() {
  if (!confirm('Reinitialiser la base viticole avec les produits par defaut ? Les produits existants ne seront pas dupliques.')) return;
  loading(true);
  try {
    // Reinit categories
    const baseCatsSnap = await getDocs(baseCol('viticole','categories'));
    const existCats = baseCatsSnap.docs.map(d => d.data().nom);
    for (const cn of DEF_CATS_VITICOLE) {
      if (!existCats.includes(cn)) await addDoc(baseCol('viticole','categories'), {nom:cn});
    }
    // Reinit produits
    const baseProdsSnap = await getDocs(baseCol('viticole','produits'));
    const existProds = baseProdsSnap.docs.map(d => d.data().nom);
    for (const p of DEF_PRODUITS) {
      if (!existProds.includes(p.nom)) await addDoc(baseCol('viticole','produits'), p);
    }
    // Reinit parcelles sur exploitation courante
    const parcSnap = await getDocs(sub(S.currentId,'parcelles'));
    if (parcSnap.empty) {
      for (const p of DEF_PARCELLES) await addDoc(sub(S.currentId,'parcelles'), p);
    }
    loading(false);
    toast('Base viticole reinitialisee');
  } catch(e) {
    loading(false);
    toast('Erreur : ' + e.message, true);
  }
};


window.filtreProduits = function(val) {
  S.produitsFiltre = val;
  renderProduits();
};

export function renderProduits() {
  const el = document.getElementById('produits-sections');
  const catNames = [...new Set([...S.categories.map(c=>c.nom), ...S.produits.map(p=>p.cat)])];
  if (!catNames.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🌿</div><div class="empty-text">Aucun produit</div></div>';
    return;
  }
  const filtre = (S.produitsFiltre||'').toUpperCase().trim();
  const matchFiltre = p => !filtre || p.nom.toUpperCase().includes(filtre);
  const rowHtml = p => '<tr style="' + (p.actif===false ? 'opacity:0.55;' : '') + '"><td style="font-weight:600;">' + (p.favori ? '⭐ ' : '') + esc(p.nom) + (p.actif===false ? ' <span style="font-size:10px;color:var(--gris);font-weight:400;">(archive)</span>' : '') + '</td><td>' + (p.qte ? p.qte + ' ' + esc(p.unite||'') : esc(p.dose||'-')) + '</td><td>' + (p.dre||0) + '</td><td>' + (p.dar||0) + '</td><td style="font-family:monospace;font-size:11px;">' + esc(p.amm||'-') + '</td><td>' + (p.doseReference!==null && p.doseReference!==undefined ? p.doseReference : '<span style="color:var(--gris);font-size:11px;">hors IFT</span>') + '</td>' +
    '<td id="stock-col-p-' + p.id + '" style="font-size:12px;color:var(--gris);">...</td>' +
    '<td><div class="td-actions">' +
    '<button class="btn btn-icon" onclick="toggleFavoriProduit(\'' + p.id + '\',' + (p.favori ? 'true' : 'false') + ')" title="' + (p.favori ? 'Retirer des favoris' : 'Marquer comme favori') + '">' + (p.favori ? '⭐' : '☆') + '</button>' +
    '<button class="btn btn-icon edt" onclick="openProduitModal(\'' + p.id + '\',null)" title="Modifier">✏️</button>' +
    '<button class="btn btn-icon del" onclick="delProduit(\'' + p.id + '\',\'' + p.nom + '\')" title="Supprimer">🗑️</button></div></td></tr>';
  el.innerHTML =
    catNames.map(cat => {
    const prodsAll = S.produits.filter(p => p.cat === cat).filter(matchFiltre);
    const prods = prodsAll.filter(p => p.actif !== false).sort((a,b) => (b.favori?1:0) - (a.favori?1:0));
    const archives = prodsAll.filter(p => p.actif === false);
    if (filtre && !prodsAll.length) return '';
    const catObj = S.categories.find(c => c.nom === cat);
    const catKey = 'c' + cat.replace(/[^a-z0-9]/gi,'');
    return '<div class="produits-cat-section">' +
      '<div class="produits-cat-header" onclick="toggleCat(\'' + catKey + '\')">' +
        '<span class="produits-cat-name">' + esc(cat) + '</span>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:11px;color:var(--gris);">' + prods.length + ' produit(s)' + (archives.length ? ' + ' + archives.length + ' archive(s)' : '') + '</span>' +
          (catObj ? '<button class="btn btn-icon edt" onclick="event.stopPropagation();openEditCatModal(\'' + catObj.id + '\',\'' + cat + '\')" title="Modifier">✏️</button>' : '') +
          (catObj ? '<button class="btn btn-icon del" onclick="event.stopPropagation();delCat(\'' + catObj.id + '\',\'' + cat + '\')" title="Supprimer">🗑️</button>' : '') +
        '</div>' +
      '</div>' +
      '<div id="' + catKey + '">' +
        '<div class="table-wrap"><table><thead><tr><th>Nom</th><th>Dose recommandee</th><th>DRE (h)</th><th>DAR (j)</th><th>N AMM</th><th>Dose ref. IFT</th><th>Stock</th><th style="text-align:right;">Actions</th></tr></thead><tbody>' +
        (prodsAll.length ? [...prods, ...archives].map(rowHtml).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--gris);font-size:12px;padding:12px;">Aucun produit</td></tr>') +
        '</tbody></table></div>' +
        '<button class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="openProduitModal(null,\'' + cat + '\')">+ Produit ' + cat + '</button>' +
      '</div>' +
    '</div>';
  }).join('');
  refreshStockColumns();
}

// ── STOCK (produits phyto + engrais) ────────────────────────
// Principe : seuls les achats sont saisis manuellement (achatsTotal, cumule sur le produit).
// La consommation est calculee automatiquement a partir de tous les passages enregistres,
// sur toutes les exploitations du meme type (stock physique commun a CORRE et VADEZ).
// Stock actuel = achatsTotal - consommation calculee. Les produits a stock <= 0 sont masques.

// Convertit une unite de dose ("L/HA", "kg/ha") en unite de stock absolue ("L", "kg").
function uniteStock(u) {
  if (!u) return '';
  const stripped = u.replace(/\s*\/\s*ha/i, '').trim();
  return stripped || u;
}

async function fetchConsommationParType(btype) {
  const relevantEx = S.exploitations.filter(e => ((e.type === 'agricole') ? 'agricole' : 'viticole') === btype);
  const consoPhyto = {};
  const consoEngrais = {};
  for (const ex of relevantEx) {
    let parcSnap, passSnap;
    try {
      [parcSnap, passSnap] = await Promise.all([
        getDocs(sub(ex.id, 'parcelles')),
        getDocs(sub(ex.id, 'passages'))
      ]);
    } catch (e) { continue; }
    const parcMap = {}, parcByNom = {};
    parcSnap.docs.forEach(d => { const data = d.data(); parcMap[d.id] = data; parcByNom[data.nom] = data; });
    passSnap.docs.forEach(d => {
      const p = d.data();
      const noms = p.parcelles || [];
      const ids = p.parcellesIds || [];
      let surfaceTotal = 0;
      noms.forEach((nom, i) => {
        const parc = (ids[i] && parcMap[ids[i]]) ? parcMap[ids[i]] : parcByNom[nom];
        surfaceTotal += parc ? (parseFloat(parc.surface) || 0) : 0;
      });
      const pct = (p.pourcentSurface ? parseFloat(p.pourcentSurface) : 100) / 100;
      if (p.type === 'engrais') {
        (p.engraisList || []).forEach(line => {
          const key = line.nom + '||' + (line.categorie || '');
          consoEngrais[key] = (consoEngrais[key] || 0) + (parseFloat(line.qte) || 0) * surfaceTotal * pct;
        });
      } else {
        (p.produits || []).forEach(line => {
          const key = line.nom + '||' + (line.cat || '');
          consoPhyto[key] = (consoPhyto[key] || 0) + (parseFloat(line.qte) || 0) * surfaceTotal * pct;
        });
      }
    });
  }
  return { consoPhyto, consoEngrais };
}

// Surface effectivement traitee par un passage (memes regles que calcIFT) : somme des surfaces
// des parcelles concernees, ponderee par le % de surface reellement traite.
function surfaceTraiteePassage(passageData) {
  const noms = passageData.parcelles || [];
  const ids = passageData.parcellesIds || [];
  const surfaceBrute = noms.reduce((sum, nom, idx) => {
    const idP = ids[idx];
    const parc = (idP && S.parcelles.find(pc => pc.id === idP)) || S.parcelles.find(pc => pc.nom === nom);
    return sum + (parc ? parseFloat(parc.surface) || 0 : 0);
  }, 0);
  const pct = Math.min(100, Math.max(0, parseFloat(passageData.pourcentSurface) || 100)) / 100;
  return surfaceBrute * pct;
}

// Ajoute (sign=+1) ou retire (sign=-1) la consommation d'un passage sur le compteur consommeTotal
// des produits/engrais concernes (champ sur bases/{type}/produits|engrais, partage entre CORRE et VADEZ).
// Appele a chaque creation/modification/suppression de passage - evite de tout relire a chaque affichage du stock.
export async function applyConsommation(passageData, sign) {
  if (!passageData) return;
  const surface = surfaceTraiteePassage(passageData);
  if (!surface) return;
  const ex = getEx();
  const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
  const isEngrais = passageData.type === 'engrais';
  const lignes = isEngrais ? (passageData.engraisList || []) : (passageData.produitsList || []);
  const writes = [];
  lignes.forEach(l => {
    const qte = parseFloat(l.qte) || 0;
    if (!qte) return;
    const base = isEngrais
      ? S.engrais.find(e => e.nom === l.nom && (e.categorie||'') === (l.categorie||''))
      : S.produits.find(p => p.nom === l.nom && (p.cat||'') === (l.cat||''));
    if (!base) return; // produit introuvable dans la base (supprime entre-temps) : consommation non comptabilisee
    const delta = sign * qte * surface;
    writes.push(setDoc(baseDoc(btype, isEngrais ? 'engrais' : 'produits', base.id), { consommeTotal: increment(delta) }, { merge: true }));
  });
  if (writes.length) { try { await Promise.all(writes); } catch (e) { console.error('Erreur mise a jour consommation', e); } }
}

// Recalcul complet de consommeTotal a partir de tout l'historique (relit passages + parcelles).
// A utiliser une seule fois pour initialiser le compteur, puis seulement en filet de securite
// si un ecart est suspecte (les mises a jour normales passent desormais par applyConsommation()).
export async function recalculerConsommation() {
  const ex = getEx();
  const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
  loading(true);
  try {
    const { consoPhyto, consoEngrais } = await fetchConsommationParType(btype);
    const writes = [];
    S.produits.forEach(p => {
      const key = p.nom + '||' + p.cat;
      writes.push(setDoc(baseDoc(btype,'produits',p.id), { consommeTotal: consoPhyto[key] || 0 }, { merge: true }));
    });
    S.engrais.forEach(eg => {
      const key = eg.nom + '||' + (eg.categorie||'');
      writes.push(setDoc(baseDoc(btype,'engrais',eg.id), { consommeTotal: consoEngrais[key] || 0 }, { merge: true }));
    });
    await Promise.all(writes);
    await setDoc(doc(db,'bases',btype), { derniereRecalculConsommation: new Date().toISOString() }, { merge: true });
    toast('Consommation recalculee');
    refreshStockColumns();
  } catch (e) { toast('Erreur : ' + e.message, true); }
  loading(false);
}
window.recalculerConsommation = recalculerConsommation;

// Stock = achats - consommation. consommeTotal est deja tenu a jour en direct (applyConsommation),
// donc plus besoin de relire tous les passages ici : simple lecture des champs deja charges (S.produits/S.engrais).
function refreshStockColumns() {
  S.produits.forEach(p => {
    const el = document.getElementById('stock-col-p-' + p.id);
    if (!el) return;
    const stock = (p.achatsTotal || 0) - (p.consommeTotal || 0);
    el.textContent = stock.toFixed(1) + ' ' + uniteStock(p.unite);
    el.style.color = stock <= 0 ? 'var(--rouge)' : 'var(--gris)';
  });
  S.engrais.forEach(eg => {
    const el = document.getElementById('stock-col-e-' + eg.id);
    if (!el) return;
    const stock = (eg.achatsTotal || 0) - (eg.consommeTotal || 0);
    el.textContent = stock.toFixed(1) + ' ' + uniteStock(eg.unite);
    el.style.color = stock <= 0 ? 'var(--rouge)' : 'var(--gris)';
  });
}

window.openStockRapide = function() {
  showPage('stock');
  const lignesPhyto = S.produits.filter(p => p.actif !== false).map(p => {
    const stock = (p.achatsTotal || 0) - (p.consommeTotal || 0);
    return { id: p.id, kind: 'phyto', nom: p.nom, cat: p.cat || 'Autre', unite: uniteStock(p.unite), stock };
  }).filter(l => l.stock > 0);
  const lignesEngrais = S.engrais.map(eg => {
    const stock = (eg.achatsTotal || 0) - (eg.consommeTotal || 0);
    return { id: eg.id, kind: 'engrais', nom: eg.nom, cat: (eg.categorie || 'Autre') + ' (engrais)', unite: uniteStock(eg.unite), stock };
  }).filter(l => l.stock > 0);
  S.dernierStockCalcule = [...lignesPhyto, ...lignesEngrais]; // reutilise pour l'export PDF et le filtre recherche sans recalculer
  const exportBtn = document.getElementById('stock-export-btn');
  if (exportBtn) exportBtn.style.display = S.dernierStockCalcule.length ? '' : 'none';
  renderStockList();
};

window.filtreStock = function(val) {
  S.stockFiltre = val;
  renderStockList();
};

function renderStockList() {
  const el = document.getElementById('stock-page-content');
  if (!el) return;
  const infoEl = document.getElementById('stock-recalc-info');
  if (infoEl) {
    const iso = S.baseMeta && S.baseMeta.derniereRecalculConsommation;
    if (!iso) {
      infoEl.innerHTML = '⚠️ Compteur de stock jamais recalcule completement — cliquez sur "🔄 Recalculer" au moins une fois.';
    } else {
      const jours = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
      const txt = jours <= 0 ? "aujourd'hui" : jours === 1 ? 'il y a 1 jour' : 'il y a ' + jours + ' jours';
      infoEl.innerHTML = 'Dernier recalcul complet : ' + txt + (jours > 60 ? ' <span style="color:var(--rouge);">— une verification periodique est recommandee</span>' : '');
    }
  }
  const filtre = (S.stockFiltre || '').toUpperCase().trim();
  const toutes = (S.dernierStockCalcule || []).filter(l => !filtre || l.nom.toUpperCase().includes(filtre));
  if (!toutes.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📦</div><div class="empty-text">Aucun stock disponible</div></div>';
    return;
  }
  const cats = [...new Set(toutes.map(l => l.cat))];
  el.innerHTML = cats.map(cat => {
    const lignes = toutes.filter(l => l.cat === cat).sort((a,b) => a.nom.localeCompare(b.nom));
    return '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--vert);margin:10px 0 4px;">' + esc(cat) + '</div>' +
      '<div class="table-wrap"><table><tbody>' +
      lignes.map(l =>
        '<tr><td style="font-weight:600;">' + esc(l.nom) + '</td>' +
        '<td style="text-align:right;white-space:nowrap;">' + l.stock.toFixed(1) + ' ' + esc(l.unite) + '</td>' +
        '<td style="text-align:right;white-space:nowrap;">' +
        '<button class="btn btn-icon" onclick="ajouterAchat(\'' + l.kind + '\',\'' + l.id + '\',\'' + l.nom.replace(/'/g,"\\'") + '\',\'' + l.unite + '\')" title="Ajouter un achat">+</button> ' +
        '<button class="btn btn-icon edt" onclick="modifierStock(\'' + l.kind + '\',\'' + l.id + '\',\'' + l.nom.replace(/'/g,"\\'") + '\',\'' + l.unite + '\',' + l.stock + ')" title="Modifier le stock">✏️</button> ' +
        '<button class="btn btn-icon del" onclick="remettreAZeroStock(\'' + l.kind + '\',\'' + l.id + '\',\'' + l.nom.replace(/'/g,"\\'") + '\',' + l.stock + ')" title="Remettre a zero">🗑️</button>' +
        '</td></tr>'
      ).join('') +
      '</tbody></table></div>';
  }).join('');
};

window.ouvrirChoixAchat = function() {
  const catsPhyto = [...new Set(S.produits.filter(p => p.actif !== false).map(p => p.cat || 'Autre'))];
  const catsEngrais = [...new Set(S.engrais.map(eg => eg.categorie || 'Autre'))];
  const optsCat = catsPhyto.map(c => '<option value="phyto||' + c + '">' + c + '</option>').join('') +
    catsEngrais.map(c => '<option value="engrais||' + c + '">' + c + ' (engrais)</option>').join('');
  const body =
    '<div class="form-group"><label>Categorie</label><select id="achat-cat-choix" onchange="majListeProduitsAchat()"><option value="">-- Choisir --</option>' + optsCat + '</select></div>' +
    '<div class="form-group" style="margin-top:10px;"><label>Produit</label><select id="achat-produit-choix"><option value="">-- Choisir une categorie d\'abord --</option></select></div>' +
    '<div class="form-group" style="margin-top:10px;"><label>Quantite achetee</label><input type="number" step="0.01" min="0" id="achat-qte-general"></div>';
  openModal('Ajouter un achat', body, async () => {
    const val = document.getElementById('achat-produit-choix').value;
    if (!val) { toast('Choisissez un produit', true); return; }
    const [kind, id] = val.split('||');
    const qte = parseFloat(document.getElementById('achat-qte-general').value) || 0;
    if (qte <= 0) { toast('Quantite invalide', true); return; }
    const ex = getEx();
    const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
    try {
      await setDoc(baseDoc(btype, kind === 'engrais' ? 'engrais' : 'produits', id), { achatsTotal: increment(qte) }, { merge: true });
      toast('Achat enregistre');
      openStockRapide();
    } catch (e) { toast('Erreur : ' + e.message, true); }
  });
};

window.majListeProduitsAchat = function() {
  const val = document.getElementById('achat-cat-choix').value;
  const sel = document.getElementById('achat-produit-choix');
  if (!val) { sel.innerHTML = '<option value="">-- Choisir une categorie d\'abord --</option>'; return; }
  const [kind, cat] = val.split('||');
  const items = kind === 'engrais'
    ? S.engrais.filter(eg => (eg.categorie || 'Autre') === cat)
    : S.produits.filter(p => p.actif !== false && (p.cat || 'Autre') === cat);
  sel.innerHTML = '<option value="">-- Choisir --</option>' +
    items.map(it => '<option value="' + kind + '||' + it.id + '">' + it.nom + '</option>').join('');
};

window.ajouterAchat = function(kind, id, nom, unite, retourPid) {
  const body =
    '<div class="form-group"><label>Quantite achetee (' + (unite || 'unite') + ') pour ' + nom + '</label>' +
    '<input type="number" step="0.01" min="0" id="achat-qte" autofocus></div>';
  openModal('Ajouter un achat', body, async () => {
    const qte = parseFloat(document.getElementById('achat-qte').value) || 0;
    if (qte <= 0) { toast('Quantite invalide', true); return; }
    const ex = getEx();
    const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
    try {
      await setDoc(baseDoc(btype, kind === 'engrais' ? 'engrais' : 'produits', id), { achatsTotal: increment(qte) }, { merge: true });
      toast('Achat enregistre');
      if (retourPid) {
        if (kind === 'engrais') openEngraisModal(retourPid); else openProduitModal(retourPid, null);
      } else {
        openStockRapide();
      }
    } catch (e) { toast('Erreur : ' + e.message, true); }
  });
};

// Corrige le stock affiche a une valeur exacte saisie manuellement (ex: apres inventaire physique).
window.modifierStock = function(kind, id, nom, unite, stockActuel) {
  const body =
    '<div class="form-group"><label>Nouveau stock reel (' + (unite || 'unite') + ') pour ' + nom + '</label>' +
    '<input type="number" step="0.01" min="0" id="stock-nouvelle-valeur" value="' + stockActuel.toFixed(1) + '" autofocus></div>';
  openModal('Modifier le stock', body, async () => {
    const nouvelleValeur = parseFloat(document.getElementById('stock-nouvelle-valeur').value);
    if (isNaN(nouvelleValeur) || nouvelleValeur < 0) { toast('Valeur invalide', true); return; }
    const delta = nouvelleValeur - stockActuel;
    const ex = getEx();
    const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
    try {
      await setDoc(baseDoc(btype, kind === 'engrais' ? 'engrais' : 'produits', id), { achatsTotal: increment(delta) }, { merge: true });
      toast('Stock corrige');
      openStockRapide();
    } catch (e) { toast('Erreur : ' + e.message, true); }
  });
};

// Remet le stock a zero (ex: produit fini, casse). Reversible via un nouvel achat ensuite.
window.remettreAZeroStock = function(kind, id, nom, stockActuel) {
  confirm2('Remettre a zero le stock de "' + nom + '" ?', 'Le stock affiche redeviendra 0. Cette action ne supprime pas le produit lui-meme.', async () => {
    const delta = -stockActuel;
    const ex = getEx();
    const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
    try {
      await setDoc(baseDoc(btype, kind === 'engrais' ? 'engrais' : 'produits', id), { achatsTotal: increment(delta) }, { merge: true });
      toast('Stock remis a zero');
      openStockRapide();
    } catch (e) { toast('Erreur : ' + e.message, true); }
  });
};

// Export PDF simple du stock actuellement affiche dans "Stock rapide" (via jsPDF, deja charge par l'app).
window.exportStockPdf = function() {
  const toutes = S.dernierStockCalcule || [];
  if (!toutes.length) { toast('Rien a exporter', true); return; }
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF();
  const ex = getEx();
  docPdf.setFontSize(14);
  docPdf.text('Stock produits - ' + (ex ? ex.nom : ''), 14, 16);
  docPdf.setFontSize(9);
  docPdf.text('Genere le ' + new Date().toLocaleDateString('fr-FR'), 14, 22);
  let y = 32;
  const cats = [...new Set(toutes.map(l => l.cat))];
  cats.forEach(cat => {
    if (y > 275) { docPdf.addPage(); y = 16; }
    docPdf.setFontSize(11);
    docPdf.setFont(undefined, 'bold');
    docPdf.text(cat, 14, y);
    y += 6;
    docPdf.setFont(undefined, 'normal');
    docPdf.setFontSize(10);
    toutes.filter(l => l.cat === cat).sort((a,b) => a.nom.localeCompare(b.nom)).forEach(l => {
      if (y > 280) { docPdf.addPage(); y = 16; }
      docPdf.text(l.nom, 18, y);
      docPdf.text(l.stock.toFixed(1) + ' ' + l.unite, 180, y, { align: 'right' });
      y += 6;
    });
    y += 4;
  });
  docPdf.save('stock_' + (ex ? ex.nom.replace(/[^a-z0-9]/gi,'_') : 'export') + '.pdf');
};

window.toggleArchiveProduit = async function(id, reactivate) {
  const ex = getEx();
  const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
  try {
    await setDoc(baseDoc(btype,'produits',id), {actif: !!reactivate ? true : false}, {merge:true});
    toast(reactivate ? 'Produit reactive' : 'Produit archive');
  } catch(e) { toast('Erreur : ' + e.message, true); }
};

window.toggleFavoriProduit = async function(id, current) {
  const ex = getEx();
  const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
  try {
    await setDoc(baseDoc(btype,'produits',id), {favori: !current}, {merge:true});
    toast(!current ? 'Ajoute aux favoris' : 'Retire des favoris');
  } catch(e) { toast('Erreur : ' + e.message, true); }
};

window.showProduitsView = function(view) {
  document.getElementById('subtab-phyto').classList.toggle('active', view==='phyto');
  document.getElementById('subtab-engrais').classList.toggle('active', view==='engrais');
  document.getElementById('produits-sections').style.display = view==='phyto' ? '' : 'none';
  document.getElementById('produits-search-wrap').style.display = view==='phyto' ? '' : 'none';
  document.getElementById('produits-liens-externes').style.display = view==='phyto' ? '' : 'none';
  document.getElementById('engrais-sections').style.display = view==='engrais' ? '' : 'none';
  S.produitsView = view;
  updateProduitsActions();
};

export function updateProduitsActions() {
  const el = document.getElementById('produits-actions');
  if (!el) return;
  if (S.produitsView === 'engrais') {
    el.innerHTML = '<button class="btn btn-primary btn-sm" onclick="openEngraisModal(null)">+ Engrais</button>';
  } else {
    el.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="openCatModal()">+ Categorie</button>' +
                    '<button class="btn btn-primary btn-sm" onclick="openProduitModal(null,null)">+ Produit</button>';
  }
}

const CATS_ENGRAIS = ['NPK','Azote seul','Oligo-elements / Foliaire','Amendement organique','Amendement calcique','Autre'];

export function renderEngrais() {
  const el = document.getElementById('engrais-sections');
  if (!el) return;
  if (!S.engrais.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🌾</div><div class="empty-text">Aucun engrais enregistre</div></div>';
    return;
  }
  const cats = [...new Set(S.engrais.map(e => e.categorie || 'Autre'))];
  el.innerHTML = cats.map(cat => {
    const prods = S.engrais.filter(e => (e.categorie||'Autre') === cat);
    return '<div class="produits-cat-section">' +
      '<div class="produits-cat-header"><span class="produits-cat-name">' + esc(cat) + '</span><span style="font-size:11px;color:var(--gris);">' + prods.length + ' produit(s)</span></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Nom</th><th>Dose habituelle</th><th>Composition</th><th>Stock</th><th style="text-align:right;">Actions</th></tr></thead><tbody>' +
      prods.map(e => {
        const compo = ['n','p','k','mgo','so3','fe'].map(k => (e.composition && e.composition[k]) ? k.toUpperCase()+':'+e.composition[k] : null).filter(Boolean).join(' / ') || '-';
        return '<tr><td style="font-weight:600;">' + esc(e.nom) + '</td><td>' + (e.qte ? e.qte+' '+esc(e.unite||'') : esc(e.dose||'-')) + '</td><td style="font-size:12px;">' + esc(compo) + '</td>' +
          '<td id="stock-col-e-' + e.id + '" style="font-size:12px;color:var(--gris);">...</td>' +
          '<td><div class="td-actions"><button class="btn btn-icon edt" onclick="openEngraisModal(\'' + e.id + '\')" title="Modifier">✏️</button><button class="btn btn-icon del" onclick="delEngrais(\'' + e.id + '\',\'' + e.nom + '\')" title="Supprimer">🗑️</button></div></td></tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }).join('');
  refreshStockColumns();
}

window.openEngraisModal = function(eid) {
  const e = eid ? S.engrais.find(x => x.id === eid) : null;
  const c = (e && e.composition) || {};
  const body =
    '<div class="form-grid">' +
      '<div class="form-group full"><label>Nom commercial</label><input type="text" id="fe-nom" value="' + (e?e.nom:'') + '" placeholder="ORGATEK" style="text-transform:uppercase;"></div>' +
      '<div class="form-group"><label>Categorie</label><select id="fe-cat">' +
        CATS_ENGRAIS.map(cn => '<option value="' + cn + '"' + (e&&e.categorie===cn?' selected':'') + '>' + cn + '</option>').join('') +
      '</select></div>' +
      '<div class="form-group"><label>Dose habituelle</label><input type="number" id="fe-qte" step="0.01" value="' + (e?e.qte||'':'') + '" placeholder="ex: 1058"></div>' +
      '<div class="form-group"><label>Unite</label><select id="fe-unite"><option value="kg/ha"' + (e&&e.unite==='kg/ha'?' selected':'') + '>kg/ha</option><option value="L/ha"' + (e&&e.unite==='L/ha'?' selected':'') + '>L/ha</option></select></div>' +
    '</div>' +
    '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--vert);margin:10px 0 6px;">Composition (% dans le produit)</div>' +
    '<div class="form-grid">' +
      '<div class="form-group"><label>N (azote)</label><input type="number" id="fe-n" step="0.1" value="' + (c.n||'') + '"></div>' +
      '<div class="form-group"><label>P (P2O5)</label><input type="number" id="fe-p" step="0.1" value="' + (c.p||'') + '"></div>' +
      '<div class="form-group"><label>K (K2O)</label><input type="number" id="fe-k" step="0.1" value="' + (c.k||'') + '"></div>' +
      '<div class="form-group"><label>MgO</label><input type="number" id="fe-mgo" step="0.1" value="' + (c.mgo||'') + '"></div>' +
      '<div class="form-group"><label>SO3 (soufre)</label><input type="number" id="fe-so3" step="0.1" value="' + (c.so3||'') + '"></div>' +
      '<div class="form-group"><label>Fe (fer chelate)</label><input type="number" id="fe-fe" step="0.1" value="' + (c.fe||'') + '"></div>' +
    '</div>' +
    (e ? '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--gris-l);">' +
      '<label style="display:block;font-size:12px;color:var(--gris);margin-bottom:2px;">Stock actuel</label>' +
      '<span id="fe-stock-val" style="font-weight:600;">Calcul en cours...</span> ' +
      '<button type="button" class="btn btn-icon" onclick="ajouterAchat(\'engrais\',\'' + e.id + '\',\'' + e.nom.replace(/'/g,"\\'") + '\',\'' + uniteStock(e.unite) + '\',\'' + e.id + '\')" title="Ajouter un achat">+</button>' +
    '</div>' : '');
  openModal(e ? 'Modifier l\'engrais' : 'Nouvel engrais', body, () => saveEngrais(eid));
  if (e) remplirStockModal('engrais', e.id, 'fe-stock-val');
};

async function saveEngrais(eid) {
  const nom = document.getElementById('fe-nom').value.toUpperCase().trim();
  if (!nom) { toast('Nom requis', true); return; }
  const qte = document.getElementById('fe-qte').value;
  const unite = document.getElementById('fe-unite').value;
  const data = {
    nom, categorie: document.getElementById('fe-cat').value,
    qte: parseFloat(qte)||0, unite, dose: qte ? (qte+' '+unite) : '',
    composition: {
      n: parseFloat(document.getElementById('fe-n').value)||0,
      p: parseFloat(document.getElementById('fe-p').value)||0,
      k: parseFloat(document.getElementById('fe-k').value)||0,
      mgo: parseFloat(document.getElementById('fe-mgo').value)||0,
      so3: parseFloat(document.getElementById('fe-so3').value)||0,
      fe: parseFloat(document.getElementById('fe-fe').value)||0
    }
  };
  const ex = getEx();
  const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
  try {
    if (eid) await setDoc(baseDoc(btype,'engrais',eid), data, {merge:true});
    else await addDoc(baseCol(btype,'engrais'), data);
    closeModal(); toast('Engrais enregistre');
  } catch(e) { toast('Erreur : ' + e.message, true); }
}

window.delEngrais = function(id, nom) {
  confirm2('Supprimer "' + nom + '" ?', 'Cet engrais sera retire de la base commune. Les passages existants ne seront pas modifies.', async () => {
    const ex = getEx();
    const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
    await deleteDoc(baseDoc(btype,'engrais',id));
    toast('Engrais supprime');
  });
};

window.toggleCat = function(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

// ── PRODUIT ──────────────────────────────────────────────────
window.openProduitModal = function(pid, defCat) {
  const p = pid ? S.produits.find(x => x.id === pid) : null;
  const catNames = [...new Set([...S.categories.map(c=>c.nom), ...S.produits.map(pr=>pr.cat)])].sort();
  const body =
    '<div class="form-grid">' +
      '<div class="form-group full"><label>Nom commercial</label><input type="text" id="fp-nom" value="' + (p?p.nom:'') + '" placeholder="HELIOCUIVRE" style="text-transform:uppercase;"></div>' +
      '<div class="form-group"><label>Categorie</label><select id="fp-cat">' +
        catNames.map(c => '<option value="' + c + '"' + ((p&&p.cat===c)||(defCat===c)?' selected':'') + '>' + esc(c) + '</option>').join('') +
      '</select></div>' +
      '<div class="form-group"><label>N AMM</label><input type="text" id="fp-amm" value="' + (p?p.amm||'':'') + '" placeholder="7 chiffres"></div>' +
      '<div class="form-group"><label>Dose recommandee</label><input type="number" id="fp-qte" step="0.01" value="' + (p?p.qte||'':'') + '" placeholder="ex: 1.5"></div>' +
      '<div class="form-group"><label>Unite</label><select id="fp-unite">' + UNITES.map(u => '<option value="' + u + '"' + (p&&p.unite===u?' selected':'') + '>' + u + '</option>').join('') + '</select></div>' +
      '<div class="form-group"><label>DRE (heures)</label><input type="number" id="fp-dre" value="' + (p?p.dre||0:0) + '"></div>' +
      '<div class="form-group"><label>DAR (jours)</label><input type="number" id="fp-dar" value="' + (p?p.dar||0:0) + '"></div>' +
      '<div class="form-group full"><label>Dose de reference IFT (optionnel)</label><input type="number" id="fp-doseref" step="0.01" value="' + (p?p.doseReference||'':'') + '" placeholder="laisser vide si non concerne par l IFT"></div>' +
    '</div>' +
    (p ? '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--gris-l);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
      '<div><label style="display:block;font-size:12px;color:var(--gris);margin-bottom:2px;">Stock actuel</label>' +
        '<span id="fp-stock-val" style="font-weight:600;">Calcul en cours...</span> ' +
        '<button type="button" class="btn btn-icon" onclick="ajouterAchat(\'phyto\',\'' + p.id + '\',\'' + p.nom.replace(/'/g,"\\'") + '\',\'' + uniteStock(p.unite) + '\',\'' + p.id + '\')" title="Ajouter un achat">+</button>' +
      '</div>' +
      '<button type="button" class="btn btn-secondary btn-sm" onclick="toggleArchiveProduit(\'' + p.id + '\',' + (p.actif===false?'true':'false') + '); closeModal();">' + (p.actif===false?'♻️ Reactiver':'📦 Archiver') + '</button>' +
    '</div>' : '');
  openModal(p ? 'Modifier le produit' : 'Nouveau produit', body, () => saveProduit(pid));
  if (p) remplirStockModal('phyto', p.id, 'fp-stock-val');
};

// Calcule et affiche le stock d'un seul produit/engrais dans un modal (ex: fiche produit).
function remplirStockModal(kind, id, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (kind === 'engrais') {
    const eg = S.engrais.find(x => x.id === id);
    if (!eg) return;
    const stock = (eg.achatsTotal || 0) - (eg.consommeTotal || 0);
    el.textContent = stock.toFixed(1) + ' ' + uniteStock(eg.unite);
  } else {
    const p = S.produits.find(x => x.id === id);
    if (!p) return;
    const stock = (p.achatsTotal || 0) - (p.consommeTotal || 0);
    el.textContent = stock.toFixed(1) + ' ' + uniteStock(p.unite);
  }
}

async function saveProduit(pid) {
  const nom = document.getElementById('fp-nom').value.toUpperCase().trim();
  if (!nom) { toast('Nom requis', true); return; }
  const qte = document.getElementById('fp-qte').value;
  const unite = document.getElementById('fp-unite').value;
  const dose = qte ? (qte + ' ' + unite) : '';
  const doseRefVal = document.getElementById('fp-doseref').value;
  const data = {nom, cat:document.getElementById('fp-cat').value, amm:document.getElementById('fp-amm').value, dose, qte: parseFloat(qte)||0, unite, dre:parseInt(document.getElementById('fp-dre').value)||0, dar:parseInt(document.getElementById('fp-dar').value)||0, doseReference: doseRefVal!=='' ? parseFloat(doseRefVal) : null};
  const ex = getEx();
  const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
  try {
    if (pid) {
      // setDoc avec merge=true : cree le document s'il n'existe pas, le met a jour s'il existe
      await setDoc(baseDoc(btype,'produits',pid), data, {merge: true});
    } else {
      await addDoc(baseCol(btype,'produits'), data);
    }
    closeModal(); toast('Produit enregistre');
  } catch(e) { toast('Erreur : ' + e.message, true); }
}

window.delProduit = function(id, nom) {
  confirm2('Supprimer "' + nom + '" ?', 'Ce produit sera retire de la base commune. Les passages existants ne seront pas modifies.', async () => {
    const ex = getEx();
    const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
    await deleteDoc(baseDoc(btype,'produits',id));
    toast('Produit supprime');
  });
};

// ── CATEGORIE ────────────────────────────────────────────────
// Créer une catégorie
window.openCatModal = function() {
  openModal(
    'Nouvelle categorie',
    '<div class="form-group"><label>Nom de la categorie</label><input type="text" id="fc-nom" placeholder="ex: Herbicides"></div>' +
    '<div class="form-group" style="margin-top:10px;"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
      '<input type="checkbox" id="fc-exclureift" style="width:18px;height:18px;">' +
      'Categorie de biocontrole (exclue du calcul de l\'IFT)' +
    '</label></div>',
    saveCat
  );
};
async function saveCat() {
  const nom = document.getElementById('fc-nom').value.trim();
  if (!nom) { toast('Nom requis', true); return; }
  const exclureIFT = document.getElementById('fc-exclureift').checked;
  const ex = getEx();
  const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
  // Vérifier doublon
  if (S.categories.find(c => c.nom.toLowerCase() === nom.toLowerCase())) {
    toast('Cette categorie existe deja', true); return;
  }
  await addDoc(baseCol(btype,'categories'), {nom, exclureIFT});
  closeModal(); toast('Categorie ajoutee');
}

// Modifier le nom (et le statut biocontrole) d'une catégorie
window.openEditCatModal = function(id, nomActuel) {
  const catObj = S.categories.find(c => c.id === id);
  openModal(
    'Modifier la categorie',
    '<div class="form-group"><label>Nouveau nom</label><input type="text" id="fc-nom-edit" value="' + nomActuel + '"></div>' +
    '<div class="form-group" style="margin-top:10px;"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
      '<input type="checkbox" id="fc-exclureift-edit"' + (catObj && catObj.exclureIFT ? ' checked' : '') + ' style="width:18px;height:18px;">' +
      'Categorie de biocontrole (exclue du calcul de l\'IFT)' +
    '</label></div>',
    () => saveEditCat(id, nomActuel)
  );
};
async function saveEditCat(id, ancienNom) {
  const nouveauNom = document.getElementById('fc-nom-edit').value.trim();
  if (!nouveauNom) { toast('Nom requis', true); return; }
  const exclureIFT = document.getElementById('fc-exclureift-edit').checked;
  const ex = getEx();
  const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
  loading(true);
  try {
    // 1. Mettre à jour le nom et le statut biocontrole de la catégorie (merge pour ne pas ecraser d'autres champs)
    await setDoc(baseDoc(btype,'categories',id), {nom: nouveauNom, exclureIFT}, {merge:true});
    // 2. Si le nom a change, mettre à jour uniquement le champ cat des produits concernés
    //    (updateDoc et non plus {...p, cat} : evite d'ecraser d'eventuelles modifs concurrentes sur le produit)
    if (nouveauNom !== ancienNom) {
      const prodsACorriger = S.produits.filter(p => p.cat === ancienNom);
      for (const p of prodsACorriger) {
        await updateDoc(baseDoc(btype,'produits',p.id), {cat: nouveauNom});
      }
      loading(false);
      closeModal();
      toast('Categorie renommee (' + prodsACorriger.length + ' produit(s) mis a jour)');
      return;
    }
    loading(false);
    closeModal();
    toast('Categorie mise a jour');
  } catch(e) {
    loading(false);
    toast('Erreur : ' + e.message, true);
  }
}

// Supprimer une catégorie ET tous ses produits
window.delCat = function(id, nom) {
  const prods = S.produits.filter(p => p.cat === nom);
  const msg = prods.length
    ? 'Cette categorie contient ' + prods.length + ' produit(s) qui seront AUSSI supprimes definitivement.'
    : 'Cette categorie est vide.';
  confirm2('Supprimer "' + nom + '" ?', msg, async () => {
    const ex = getEx();
    const btype = (ex && ex.type === 'agricole') ? 'agricole' : 'viticole';
    loading(true);
    try {
      // 1. Supprimer tous les produits de cette catégorie
      for (const p of prods) {
        await deleteDoc(baseDoc(btype,'produits',p.id));
      }
      // 2. Supprimer la catégorie
      await deleteDoc(baseDoc(btype,'categories',id));
      loading(false);
      toast('Categorie et ' + prods.length + ' produit(s) supprimes');
    } catch(e) {
      loading(false);
      toast('Erreur : ' + e.message, true);
    }
  });
};
