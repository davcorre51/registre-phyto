// ── EXPORT (JSON, Excel, CSV, sauvegarde automatique) ───────
// Module extrait le 19/07/2026 (etape 8 de la modularisation, voir STRUCTURE.md).
//
// Module autonome : aucun appel vers render()/openModal()/showPage() (contrairement aux
// modules precedents), donc aucun besoin de fallback via window ici.

import { getDocs, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { fmtDate, toISO, toast } from './utils.js';
import { S, getEx, calcIFT, yearOf } from './state.js';
import { db, sub, baseCol, exploitsCol, backupsCol } from './firebase-data.js';

async function construireDumpComplet() {
  const dump = { genereLe: new Date().toISOString(), exploitations: [], bases: {} };
  const expSnap = await getDocs(exploitsCol());
  for (const expDoc of expSnap.docs) {
    const eid = expDoc.id;
    const exData = { id: eid, ...expDoc.data() };
    for (const sousColl of ['passages', 'parcelles', 'cultures', 'campagnes']) {
      const sSnap = await getDocs(sub(eid, sousColl));
      exData[sousColl] = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    dump.exploitations.push(exData);
  }
  for (const type of ['viticole', 'agricole']) {
    dump.bases[type] = {};
    for (const nom of ['produits', 'categories', 'applicateurs', 'engrais']) {
      const bSnap = await getDocs(baseCol(type, nom));
      dump.bases[type][nom] = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  }
  return dump;
}

window.exportSauvegardeJSON = async function() {
  try {
    toast('Preparation de la sauvegarde...');
    const dump = await construireDumpComplet();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `sauvegarde-registre-phyto-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Sauvegarde telechargee');
  } catch (e) {
    console.error('Erreur sauvegarde JSON', e);
    toast('Erreur lors de la sauvegarde', true);
  }
};

// Sauvegarde automatique (ajoutee le 15/07/2026) : une fois par jour (par appareil, via localStorage),
// enregistre le meme dump complet que l'export manuel dans la collection Firestore `backups`,
// et ne conserve que les NB_BACKUPS_MAX plus recentes pour eviter une croissance illimitee.
const NB_BACKUPS_MAX = 20;
export async function verifierSauvegardeAuto() {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  let derniere = null;
  try { derniere = localStorage.getItem('derniereSauvegardeAutoDate'); } catch(e) {}
  if (derniere === aujourdHui) return; // deja fait aujourd'hui sur cet appareil
  try {
    const dump = await construireDumpComplet();
    await addDoc(backupsCol(), dump);
    try { localStorage.setItem('derniereSauvegardeAutoDate', aujourdHui); } catch(e) {}
    // Nettoyage : ne garder que les NB_BACKUPS_MAX sauvegardes les plus recentes
    const snap = await getDocs(backupsCol());
    const docs = snap.docs.map(d => ({ id: d.id, genereLe: d.data().genereLe || '' })).sort((a,b) => a.genereLe.localeCompare(b.genereLe));
    if (docs.length > NB_BACKUPS_MAX) {
      const aSupprimer = docs.slice(0, docs.length - NB_BACKUPS_MAX);
      for (const d of aSupprimer) await deleteDoc(doc(db, 'backups', d.id));
    }
    console.log('Sauvegarde automatique effectuee (' + aujourdHui + ')');
  } catch (e) {
    console.error('Erreur sauvegarde automatique', e); // silencieux pour l'utilisateur : ne bloque jamais l'usage normal de l'appli
  }
}

window.exportExcel = function() {
  const ex = getEx();
  const expSel = document.getElementById('export-campagne');
  const campagne = (expSel ? expSel.value : null) || S.campagne;
  const dateRecolte = (S.datesRecolte && S.datesRecolte[campagne]) || document.getElementById('export-recolte').value || '';
  const passages = S.passages.filter(p => yearOf(p) === campagne && p.type !== 'engrais').sort((a,b) => toISO(a.date)<toISO(b.date)?-1:1);
  const rows = [];

  // ── TITRE ──
  rows.push(['Fiche enregistrement phytosanitaires ' + campagne]);

  // ── PAVÉ EXPLOITATION : A=label, B=valeur ──
  rows.push(['Identification', ex.nom]);
  rows.push(['SIRET:', {t:'s', v:String(ex.siret||'')}]);
  if (ex.type !== 'agricole') rows.push(['Date de recolte:', dateRecolte]);

  // ── LIGNE VIDE ──
  rows.push([]);

  // ── ENTETES PASSAGES : 1 colonne par passage, sans vides ──
  rows.push(['Nbr. de passage', '', ...passages.map((_,i) => i+1)]);
  rows.push(['Date de passage', '', ...passages.map(p => fmtDate(p.date))]);
  rows.push(['DRE',             '', ...passages.map(p => parseInt(p.dre)||0)]);
  rows.push(['IFT',             '', ...passages.map(p => { try { var v = (p.ift!==undefined && p.ift!==null ? p.ift : calcIFT(p)); return Number.isFinite(v) ? v : 0; } catch(e) { return 0; } })]);

  // ── PRODUITS PAR CATEGORIE ──
  // Sequence d'affichage fixee explicitement (l'ordre brut stocke en base est alphabetique,
  // ce qui ne correspond pas a la lecture agronomique souhaitee) :
  // Adjuvants, Biocontrole/SDN, Botrytis, Mildiou, Oidium, Nutrition foliaire, Herbicides, Insecticides.
  // Toute categorie non prevue dans cette liste est ajoutee a la fin, dans son ordre d'origine.
  const normCat = s => (s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const SEQUENCE = ['ADJUVANTS', 'BIOCONTROLE / SDN', 'BOTRYTIS', 'MILDIOU', 'OIDIUM', 'NUTRITION FOLIAIRE', 'HERBICIDES', 'INSECTICIDES'];
  const catNamesRaw = [...new Set([...S.categories.map(c=>c.nom), ...S.produits.map(p=>p.cat)])];
  const catNames = [...catNamesRaw].sort((a, b) => {
    const ia = SEQUENCE.indexOf(normCat(a)), ib = SEQUENCE.indexOf(normCat(b));
    if (ia === -1 && ib === -1) return catNamesRaw.indexOf(a) - catNamesRaw.indexOf(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  catNames.forEach(cat => {
    const noms = [], doses = [];
    passages.forEach(p => {
      const pp = (p.produitsList||[]).filter(pr => pr.cat === cat);
      noms.push(pp.map(pr => pr.nom).join(' + ') || '');
      doses.push(pp.map(pr => pr.qte ? pr.qte + ' ' + (pr.unite||'') : (pr.dose||'')).join(' / ') || '');
    });
    // Ligne vide avant chaque categorie (comme fichier original)
    rows.push([]);
    rows.push([cat, 'Nom', ...noms]);
    rows.push(['',   'Qte', ...doses]);
  });

  // ── NOTES ──
  const hasNotes = passages.some(p => p.notes && p.notes.trim());
  if (hasNotes) {
    rows.push([]);
    rows.push(['Notes / observations', '', ...passages.map(p => {
      const pct = (p.pourcentSurface && p.pourcentSurface < 100) ? p.pourcentSurface + '% de la surface traitee' : '';
      return [pct, p.notes||''].filter(Boolean).join(' — ');
    })]);
  }

  // ── APPLICATEUR ──
  const hasExterne = passages.some(p => p.applicateurId);
  if (hasExterne) {
    rows.push(['Applicateur', '', ...passages.map(p => p.applicateurId ? (p.applicateurNom||'') : '')]);
    rows.push(['SIRET applicateur', '', ...passages.map(p => p.applicateurId ? {t:'s',v:String(p.applicateurSiret||'')} : '')]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:22},{wch:14}, ...Array(Math.max(passages.length,1)).fill({wch:16})];
  XLSX.utils.book_append_sheet(wb, ws, 'Traitements ' + campagne);

  // ── ONGLET PARCELLES ──
  const parcRows = [];
  parcRows.push(['Identification', ex.nom]);
  parcRows.push(['SIRET:', {t:'s', v:String(ex.siret||'')}]);
  parcRows.push([]);
  parcRows.push(['Code commune', 'Nom commune', 'Parcelle', 'Surface (ha)', 'Ilot', 'GPS']);
  S.parcelles.forEach(p => parcRows.push([
    p.commune||'', p.ville||'', p.nom, p.surface||'', p.ilot||'', p.gps||''
  ]));
  const wsP = XLSX.utils.aoa_to_sheet(parcRows);
  wsP['!cols'] = [{wch:14},{wch:22},{wch:20},{wch:12},{wch:10},{wch:40}];
  XLSX.utils.book_append_sheet(wb, wsP, 'Parcelles');

  // ── ONGLET PRODUITS ──
  // Collecter tous les produits distincts utilisés dans la campagne, par catégorie
  const prodsUtilises = {}; // {cat: [{nom, amm}]}
  passages.forEach(p => {
    (p.produitsList||[]).forEach(pr => {
      if (!prodsUtilises[pr.cat]) prodsUtilises[pr.cat] = [];
      const exists = prodsUtilises[pr.cat].find(x => x.nom === pr.nom);
      if (!exists) {
        const base = S.produits.find(b => b.nom === pr.nom && b.cat === pr.cat);
        prodsUtilises[pr.cat].push({nom: pr.nom, amm: (base && base.amm) ? base.amm : (pr.amm||'')});
      }
    });
  });

  // Structure : catégories en colonnes (3 colonnes par cat : Produits | AMM | vide)
  const cats = Object.keys(prodsUtilises).sort();
  const prodRows = [];

  // Ligne titre
  prodRows.push(['Produits utilises sur la campagne ' + campagne]);
  prodRows.push(['Identification', ex.nom]);
  prodRows.push(['SIRET:', {t:'s', v:String(ex.siret||'')}]);
  prodRows.push([]);

  // Ligne catégories
  const catHeaderRow = [];
  cats.forEach(cat => { catHeaderRow.push(cat, '', ''); });
  prodRows.push(catHeaderRow);

  // Ligne sous-entetes Produits / AMM
  const subHeaderRow = [];
  cats.forEach(() => { subHeaderRow.push('Produits', 'AMM', ''); });
  prodRows.push(subHeaderRow);

  // Lignes produits : autant de lignes que le max de produits dans une catégorie
  const maxProds = Math.max(...cats.map(cat => prodsUtilises[cat].length), 0);
  for (let i = 0; i < maxProds; i++) {
    const row = [];
    cats.forEach(cat => {
      const prod = prodsUtilises[cat][i];
      row.push(prod ? prod.nom : '', prod ? {t:'s',v:String(prod.amm||'')} : '', '');
    });
    prodRows.push(row);
  }

  const wsProd = XLSX.utils.aoa_to_sheet(prodRows);
  // Largeur colonnes : 3 colonnes par catégorie (Produit=20, AMM=12, sep=2)
  const prodCols = [];
  cats.forEach(() => { prodCols.push({wch:22}, {wch:12}, {wch:2}); });
  wsProd['!cols'] = prodCols;
  XLSX.utils.book_append_sheet(wb, wsProd, 'Produits ' + campagne);

  // ── ONGLET ENGRAIS ──
  const passagesEng = S.passages.filter(p => yearOf(p) === campagne && p.type === 'engrais' && (p.engraisList||[]).length);
  if (passagesEng.length) {
    const engRows = [];
    engRows.push(['Fertilisation ' + campagne]);
    engRows.push(['Identification', ex.nom]);
    engRows.push(['SIRET:', {t:'s', v:String(ex.siret||'')}]);
    engRows.push([]);
    engRows.push(['Date','Produit','Categorie','Dose','N (kg/ha)','P (kg/ha)','K (kg/ha)','MgO (kg/ha)','SO3 (kg/ha)','Fe (kg/ha)','Parcelles','Applicateur','Commentaires']);
    const totaux = {n:0,p:0,k:0,mgo:0,so3:0,fe:0};
    passagesEng.forEach(p => {
      (p.engraisList||[]).forEach(e => {
        const a = e.apportsCalcules || {};
        engRows.push([
          fmtDate(p.date), e.nom, e.categorie||'',
          (e.qte||0) + ' ' + (e.unite||''),
          a.n||0, a.p||0, a.k||0, a.mgo||0, a.so3||0, a.fe||0,
          (p.parcelles||[]).join(' / '), (p.applicateurId ? (p.applicateurNom||'') : ex.nom), p.notes||''
        ]);
        ['n','p','k','mgo','so3','fe'].forEach(k => { totaux[k] += a[k]||0; });
      });
    });
    engRows.push([]);
    engRows.push(['Total apports campagne', '', '', '', totaux.n, totaux.p, totaux.k, totaux.mgo, totaux.so3, totaux.fe, '', '', '']);
    const wsEng = XLSX.utils.aoa_to_sheet(engRows);
    wsEng['!cols'] = [{wch:12},{wch:18},{wch:16},{wch:14},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:24},{wch:18},{wch:24}];
    XLSX.utils.book_append_sheet(wb, wsEng, 'Engrais ' + campagne);
  }

  XLSX.writeFile(wb, 'Registre_phyto_' + ex.nom.replace(/\s/g,'_') + '_' + campagne + '.xlsx');
  toast('Export Excel telecharge');
};

window.exportCSV = function() {
  const ex = getEx();
  const header = ['N Ilot','N Parcelle','Code commune','GPS','Culture','Label AB','Nom produit','N AMM','Date','Quantite','Surface','Mode','H debut','H fin','Cible','DRE','Stade','Applicateur','SIRET applicateur'];
  const rows = [header];
  const expSelCSV = document.getElementById('export-campagne');
  const campagneCSV = (expSelCSV ? expSelCSV.value : null) || S.campagne;
  S.passages.filter(p => yearOf(p) === campagneCSV).forEach(p => {
    (p.produitsList||[]).forEach(pr => {
      (p.parcelles||['']).forEach(parc => {
        const pi = S.parcelles.find(pa=>pa.nom===parc)||{};
        rows.push([pi.ilot||'',parc,pi.commune||'',pi.gps||'','Vigne',ex.ab?'Oui':'Non',pr.nom,pr.amm||'',fmtDate(p.date),(pr.qte ? pr.qte+' '+(pr.unite||'') : pr.dose||''),pi.surface||'','Plein air',p.heureDebut||'',p.heureFin||'',pr.cat,parseInt(pr.dre)||'',p.stade||'',p.applicateurNom||ex.nom,'='+JSON.stringify(String(p.applicateurSiret||ex.siret||''))]);
      });
    });
  });
  const csv = rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n');
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'Registre_reglementaire_' + ex.nom.replace(/\s/g,'_') + '.csv';
  a.click(); URL.revokeObjectURL(url);
  toast('CSV reglementaire telecharge');
};
