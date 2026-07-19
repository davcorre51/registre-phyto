// ── CONSTANTES ET ÉTAT GLOBAL ────────────────────────────────
// Module extrait le 19/07/2026 (étape 2 de la modularisation, voir STRUCTURE.md).
//
// IMPORTANT pour la suite du decoupage : S est exporte comme un objet UNIQUE et PARTAGE.
// Tout module qui a besoin de lire/modifier l'etat doit faire
//   import { S } from './state.js';
// et non recreer sa propre variable S localement — sinon les modules ne se verraient
// plus les uns les autres (deux etats distincts et desynchronises).
// S est mute (S.passages = [...], S.currentId = 'xxx'...) mais jamais reassigne
// entierement (jamais `S = {...}` apres cette declaration) : verifie sur tout le fichier
// d'origine, a respecter dans les futurs modules egalement.

import { toISO } from './utils.js';

export const UNITES = ['L/HA', 'KG/HA', 'L/HL'];

export const STADES_VITICOLE = [
  'Bourgeon dans le coton','Feuilles etalees','Grappes visibles',
  'Grappes separees','Boutons floraux separes','Debut fleur',
  'Pleine fleur','Nouaison','Grain de pois',
  'Debut fermeture grappe','Fin fermeture grappe'
];

export const CULTURES_AGRICOLE = [
  'Ble tendre','Orge','Colza','Tournesol','Mais'
];

export const STADES_AGRICOLE = {
  'Ble tendre': ['Semis','Levee','Tallage','Montaison','Epi 1 cm','Gonflement','Epiaison','Floraison','Grain laiteux','Grain pateux','Maturite'],
  'Orge':       ['Semis','Levee','Tallage','Montaison','Epi 1 cm','Gonflement','Epiaison','Floraison','Grain laiteux','Grain pateux','Maturite'],
  'Colza':      ['Semis','Levee','Rosette','Montaison','Bouton floral','Debut floraison','Pleine floraison','Fin floraison','Siliques vertes','Maturite'],
  'Tournesol':  ['Semis','Levee','4 feuilles','6 feuilles','8 feuilles','Bouton floral','Debut floraison','Pleine floraison','Fin floraison','Maturite'],
  'Mais':       ['Semis','Levee','3 feuilles','6 feuilles','10 feuilles','Montaison','Floraison male','Floraison femelle','Grain laiteux','Maturite']
};

export function getStades(exploit, culture) {
  if (!exploit || exploit.type !== 'agricole') return STADES_VITICOLE;
  return (culture && STADES_AGRICOLE[culture]) ? STADES_AGRICOLE[culture] : [];
}

export const DEF_CATS_VITICOLE = ['Mildiou','Oidium','Biocontrole / SDN','Adjuvants','Botrytis','Nutrition foliaire','Insecticides'];
export const DEF_CATS_AGRICOLE = ['Herbicides','Fongicides','Insecticides','Regulateurs de croissance','Adjuvants','Nutrition foliaire'];

export const DEF_PRODUITS = [
  {nom:'HELIOCUIVRE',cat:'Mildiou',dre:48,amm:'',dose:'1L/HA'},
  {nom:'FANTIC',cat:'Mildiou',dre:48,amm:'',dose:'2KG/HA'},
  {nom:'FUTURA',cat:'Mildiou',dre:48,amm:'',dose:'4L/HA'},
  {nom:'PEXIUM',cat:'Mildiou',dre:48,amm:'',dose:'0,5KG/HA'},
  {nom:'ZORVEC',cat:'Mildiou',dre:48,amm:'',dose:'0,2L/HA'},
  {nom:'VIDERYO',cat:'Mildiou',dre:48,amm:'',dose:'2,5L/HA'},
  {nom:'ELECTIS BLEU',cat:'Mildiou',dre:24,amm:'',dose:'1,96L/HA'},
  {nom:'FOLPAN',cat:'Mildiou',dre:48,amm:'',dose:'1,25KG/HA'},
  {nom:'MICROTHIOL',cat:'Oidium',dre:6,amm:'',dose:'10KG/HA'},
  {nom:'VIVANDO',cat:'Oidium',dre:6,amm:'',dose:'0,2L/HA'},
  {nom:'YARIS',cat:'Oidium',dre:48,amm:'',dose:'0,15L/HA'},
  {nom:'HOGGAR',cat:'Oidium',dre:48,amm:'',dose:'0,6L/HA'},
  {nom:'REVYVIT',cat:'Oidium',dre:48,amm:'',dose:'2L/HA'},
  {nom:'LUNA XTEND',cat:'Oidium',dre:48,amm:'',dose:'0,2L/HA'},
  {nom:'THIOPRON RAIN FREE',cat:'Oidium',dre:48,amm:'',dose:'6,8L/HA'},
  {nom:'REDELI',cat:'Biocontrole / SDN',dre:0,amm:'',dose:'2,5L/Ha'},
  {nom:'VINIVAX',cat:'Biocontrole / SDN',dre:0,amm:'',dose:'1L/Ha'},
  {nom:'INVELOP',cat:'Biocontrole / SDN',dre:0,amm:'',dose:'10KG/HA'},
  {nom:'STICMAN',cat:'Adjuvants',dre:0,amm:'',dose:'0,14L/HL'},
  {nom:'ISOTAC',cat:'Adjuvants',dre:0,amm:'',dose:'0,3L/HL'},
  {nom:'GEOXE',cat:'Botrytis',dre:0,amm:'',dose:'1KG/HA'},
  {nom:'Nutribio Fe',cat:'Nutrition foliaire',dre:0,amm:'',dose:'3L/Ha'},
  {nom:'VIVAFLOR',cat:'Nutrition foliaire',dre:0,amm:'',dose:'3L/Ha'}
];

export const DEF_PARCELLES = [
  {nom:'CHALMONTS',surface:0.4,ilot:'',ville:'',commune:'',gps:''},
  {nom:'SABLONS',surface:0.35,ilot:'',commune:'',gps:''},
  {nom:'LES MACHERETS',surface:0.3,ilot:'',commune:'',gps:''},
  {nom:'PINOCHES',surface:0.25,ilot:'',commune:'',gps:''},
  {nom:'FOSSES BLANCS',surface:0.42,ilot:'',commune:'',gps:''},
  {nom:'LES PARADIS',surface:0.38,ilot:'',commune:'',gps:''},
  {nom:'FONTAINE DENIS',surface:0.5,ilot:'',commune:'',gps:''},
  {nom:'LA CHAUX',surface:0.32,ilot:'',commune:'',gps:''}
];

// ── STATE ───────────────────────────────────────────────────
export const S = {
  exploitations: [],
  currentId: null,
  campagne: String(new Date().getFullYear()),
  passages: [],
  produits: [],      // depuis base commune
  produitsFiltre: '',
  engrais: [],       // depuis base commune (fertilisation)
  produitsView: 'phyto',
  passagesView: 'phyto',
  categories: [],    // depuis base commune
  parcelles: [],     // propre a l'exploitation
  cultures: [],      // propre a l'exploitation (agricole)
  sitesMeteoByExploit: {}, // {exploitationId: [sites...]} - jamais partage entre exploitations, meme en cas de callback tardif
  unsubs: [],
  unsubBase: [],     // listeners base commune
  pluvioData: {},    // cache en memoire de l'historique de pluie par site {siteKey: {label, jours}}
  datesRecolte: {},
  recoltesConfirmees: {},
  baseMeta: {}, // contenu du document bases/{type} lui-meme (ex: derniereRecalculConsommation)
  pluvioPage: { siteKey: null, year: null, view: 'mensuel', mois: null, cache: null } // etat de la page Pluviometrie detaillee
};

// ── REQUETES SUR L'ETAT (aucune dependance DOM/Firestore) ────
// yearOf, cpPassages, nextPassageNum, getEx, calcIFT extraits ici (au lieu d'un module
// separe) le 19/07/2026, car pluviometrie.js (et les modules suivants) en ont besoin
// et ce sont des fonctions pures sur S : leur place naturelle est avec l'etat lui-meme.
export function yearOf(p) {
  if (p.campagne) return p.campagne;
  const iso = toISO(p.date);
  return iso ? iso.slice(0,4) : String(new Date().getFullYear());
}
export function cpPassages() { return S.passages.filter(p => yearOf(p) === S.campagne); }

// Calcule le prochain numero de passage a partir du numero MAX existant (pas du nombre de passages),
// pour eviter un doublon si un passage a ete supprime au milieu de la sequence.
export function nextPassageNum(kind) {
  const liste = cpPassages().filter(x => (kind === 'engrais') ? x.type === 'engrais' : x.type !== 'engrais');
  const maxNum = liste.reduce((max, x) => Math.max(max, x.num || 0), 0);
  return maxNum + 1;
}
export function getEx() { return S.exploitations.find(e => e.id === S.currentId); }

// IFT (Indice de Frequence de Traitement) d'un passage = somme, pour chaque produit hors biocontrole,
// de (dose appliquee / dose recommandee) x (surface traitee / surface totale exploitation - methode A).
export function calcIFT(passage) {
  if (!passage || passage.type === 'engrais') return 0;
  const ex = S.exploitations.find(e => e.id === S.currentId) || getEx();
  const surfaceExploit = ex ? parseFloat(ex.surface)||0 : 0;
  if (!surfaceExploit) return 0;
  const ids = passage.parcellesIds || [];
  const surfaceTraiteeBrute = (passage.parcelles||[]).reduce((sum, nomP, idx) => {
    const idP = ids[idx];
    const parc = (idP && S.parcelles.find(pc => pc.id === idP)) || S.parcelles.find(pc => pc.nom === nomP);
    return sum + (parc ? parseFloat(parc.surface)||0 : 0);
  }, 0);
  const pct = Math.min(100, Math.max(0, parseFloat(passage.pourcentSurface) || 100)) / 100;
  const surfaceTraitee = surfaceTraiteeBrute * pct;
  if (!surfaceTraitee) return 0;
  let total = 0;
  (passage.produitsList||[]).forEach(pr => {
    const catObj = S.categories.find(c => c.nom === pr.cat);
    // Categorie retrouvee : on se fie au champ explicite exclureIFT.
    // Si le champ n'a jamais ete renseigne (categorie creee avant ce champ, pas encore migree),
    // on retombe sur l'ancienne detection par nom en filet de securite.
    const exclu = catObj && catObj.exclureIFT !== undefined
      ? catObj.exclureIFT
      : (pr.cat||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('BIOCONTROLE');
    if (exclu) return; // exclu de l'IFT (methode IFT hors biocontrole)
    const doseRef = pr.doseReferenceIFT;
    if (doseRef===null || doseRef===undefined || !Number.isFinite(doseRef) || doseRef <= 0) return; // pas de dose de reference = produit hors IFT
    const doseAppliquee = parseFloat(pr.qte) || 0;
    total += (doseAppliquee / doseRef) * (surfaceTraitee / surfaceExploit);
  });
  return total;
}
