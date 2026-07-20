# Structure Firebase — Registre Phytosanitaire

Document de référence sur l'organisation des données Firestore. À mettre à jour à chaque ajout de collection ou de champ (ex : engrais, pluviométrie).

Dernière mise à jour : 19 juillet 2026.

---

## Vue d'ensemble

Le projet utilise deux grandes familles de collections :

- **`exploitations`** : les données propres à chaque exploitation (viticole ou agricole) — passages, parcelles, cultures, campagnes, sites météo suivis, historique de pluviométrie.
- **`bases`** : les référentiels communs partagés (produits, catégories, applicateurs), séparés par type (`viticole` / `agricole`).

Authentification : anonyme (Firebase Auth). Toute lecture/écriture nécessite `request.auth != null`.

---

## Architecture du code (fichiers JS)

**Modularisée le 19/07/2026** (jusque-là, `index.html` contenait tout le JavaScript en un seul `<script type="module">` de ~3860 lignes). Le fichier est maintenant scindé en plusieurs modules ES (`import`/`export` natifs, sans bundler — fonctionne tel quel sur GitHub Pages), tous dans un dossier `js/` à côté d'`index.html` :

| Fichier | Contenu | Dépend de |
|---|---|---|
| `js/utils.js` | Fonctions pures/DOM minimal : `esc`, `fmtDate`, `toISO`, `addDaysToDate`, `normText`, `toast`, `loading`, `confirm2` | — |
| `js/state.js` | État global `S` (objet unique et partagé, muté jamais réassigné), constantes (stades, cultures, unités, données par défaut), et requêtes pures sur l'état : `yearOf`, `cpPassages`, `nextPassageNum`, `getEx`, `calcIFT` | `utils.js` |
| `js/firebase-data.js` | Config Firebase, init, authentification anonyme (`waitForAuth`), chemins Firestore (`sub`, `subdoc`, `baseCol`, `baseDoc`, `exploitsCol`, `exploitDoc`, `backupsCol`) | — |
| `js/pluviometrie.js` | Sites météo, synchro Open-Meteo, page pluviométrie détaillée (graphiques), import CSV station locale | `utils.js`, `state.js`, `firebase-data.js` |
| `js/produits-stock.js` | Référentiel produits/engrais/catégories, gestion de stock, consommation (`applyConsommation`, `recalculerConsommation`) | `utils.js`, `state.js`, `firebase-data.js` |
| `js/passages.js` | Formulaires passage phyto + engrais (rendu liste, save/delete/duplicate, calcul IFT à l'enregistrement) | `utils.js`, `state.js`, `firebase-data.js`, `produits-stock.js` |
| `js/crud-annexes.js` | Parcelles, exploitations, applicateurs (CRUD + rendu) | `utils.js`, `state.js`, `firebase-data.js`, `pluviometrie.js` |
| `js/export.js` | Export JSON complet, Excel, CSV réglementaire, sauvegarde automatique quotidienne | `utils.js`, `state.js`, `firebase-data.js` |
| `index.html` (script inline restant) | Orchestrateur : `init`, `listenBase`/`listenExploit` (listeners Firestore temps réel), `render` (fonction chef d'orchestre qui appelle tous les `render*` des modules), `showPage`, `updateTopbar`, tableau de bord (`renderDash`, `renderDarSummary`), sélecteur de campagne, modal générique (`openModal`/`closeModal`) | tous les modules ci-dessus |

**Convention "window fallback"** (à connaître avant de toucher à ce code) : certaines fonctions de l'orchestrateur (`render`, `openModal`, `closeModal`, `showPage`, `listenExploit`) sont appelées depuis les modules "feuilles" (ex. `pluviometrie.js` a besoin de rafraîchir l'affichage global après une synchro). Comme le script principal d'`index.html` n'est pas un fichier module nommé/importable, ces fonctions sont explicitement exposées via `window.render = render;` (etc.) juste après leur définition, et les modules feuilles les appellent en identifiant global nu (`render()`, pas `window.render()` — la résolution passe quand même par `window` grâce à la chaîne de portée JS). **Piège à éviter** : si une nouvelle fonction de l'orchestrateur doit être appelée depuis un module, il faut soit l'exporter/l'importer normalement (si le sens de dépendance le permet), soit l'ajouter à cette liste d'exposition `window.*` — l'oublier provoque un `ReferenceError` silencieux seulement au moment de l'appel (pas au chargement).

**Module 9 non fait (arrêté volontairement le 19/07/2026)** : l'extraction finale de l'orchestrateur lui-même (`dashboard.js`) n'a pas été faite — `index.html` ne fait plus que ~823 lignes (script + HTML + CSS), jugé suffisamment gérable pour s'arrêter là. À reprendre si le fichier regrossit significativement.

**Procédure de mise à jour d'un module sur GitHub** : "Create new file" (taper `js/nom.js`, le `/` crée le dossier automatiquement) pour un nouveau fichier ; Edit (crayon) → Ctrl+A → remplacer pour un fichier existant. Toujours remplacer `index.html` en entier après une modification touchant ses imports.

---



## Collection `exploitations`

Chemin : `exploitations/{exploitationId}`

| Champ | Type | Description |
|---|---|---|
| `nom` | string | Nom de l'exploitation |
| `type` | string | `'viticole'` ou `'agricole'` |
| `siret` | string | Numéro SIRET (attention : peut apparaître en notation scientifique si mal importé depuis Excel) |
| `surface` | number | Surface totale en hectares |
| `ab` | boolean | Agriculture biologique ou non |
| `createdAt` | timestamp | Date de création (serverTimestamp) |

### Sous-collection `exploitations/{id}/passages`

Un passage = une intervention phytosanitaire enregistrée.

| Champ | Type | Description |
|---|---|---|
| `num` | number | Numéro de passage |
| `campagne` | string | Année de campagne (ex : "2026") |
| `culture` | string | Culture concernée (surtout pour l'agricole) |
| `date` | string | Date au format JJ/MM/AA |
| `heureDebut` / `heureFin` | string | Heures de l'intervention |
| `stade` | string | Stade phénologique (BBCH) |
| `dre` | number | Délai de ré-entrée (heures) |
| `parcelles` | array<string> | Noms des parcelles concernées (affichage, export — inchangé) |
| `parcellesIds` | array<string> | **Identifiants stables des parcelles** (ajouté le 23/06/2026), dans le même ordre que `parcelles`. Permet de retrouver la bonne parcelle même si elle est renommée plus tard (utilisé notamment par `calcIFT()` pour la surface traitée). Absent sur les passages créés avant cette date : dans ce cas, la résolution retombe sur la correspondance par nom (`parcelles`), comme avant |
| `pourcentSurface` | number | **% de la surface réellement traitée** (ajouté le 24/06/2026), de 1 à 100. Par défaut 100 (traitement total). Utilisé pour le désherbage localisé (ex : 66% de la parcelle), réduit la surface traitée prise en compte dans le calcul IFT proportionnellement |
| `produitsList` | array<object> | Liste des produits appliqués, chacun avec `{nom, cat, dose, qte, unite, dre, dar, amm, doseReferenceIFT}` — `doseReferenceIFT` est une copie de la dose de référence IFT du produit au moment du passage (peut être `null` si non renseignée, le produit est alors exclu du calcul IFT) |
| `ift` | number | **IFT (Indice de Fréquence de Traitement) cumulé du passage** (ajouté le 21/06/2026), calculé et stocké à l'enregistrement |
| `applicateurId` | string | Référence à l'applicateur (sous-collection `applicateurs` de la base) |
| `applicateurNom` / `applicateurSiret` | string | Copie des infos applicateur au moment du passage |
| `notes` | string | Remarques libres |
| `createdAt` / `updatedAt` | timestamp | Horodatage |

**Champ `type`** (ajouté le 20/06/2026) : chaque passage est soit `'phyto'` (traitement, avec `produitsList`), soit `'engrais'` (fertilisation, avec `engraisList`) — deux types distincts, pas combinés sur un même document. La page "Passages" propose deux sous-onglets (Phyto / Engrais) avec un bouton "+ Ajouter" et une numérotation (`num`) propres à chacun, pour ne pas perturber la numérotation des passages phyto utilisée dans l'export Excel.

**Badge DAR** (ajouté le 07/07/2026) : sur chaque passage phyto, un badge compare la date de récolte sûre (date du passage + DAR le plus long des produits appliqués, voir champ `dar` sur les produits ci-dessous) à `dateRecolte` de la campagne en cours (`exploitations/{id}/campagnes/{annee}`). Affichage volontairement minimal : **"DAR OK"** (vert) si le délai est respecté, **"DAR NON"** (rouge) sinon ; le détail (dates précises, caractère prévisionnel ou confirmé) reste accessible en info-bulle. Si aucune date de récolte n'est encore renseignée pour la campagne, le badge reste purement informatif (date sûre affichée sans comparaison possible). Voir le calcul dans `renderPassages()`.

**Duplication de passage** (ajoutée le 07/07/2026) : bouton "📄 Dupliquer" sur chaque passage (phyto et engrais), ouvre un nouveau formulaire pré-rempli à l'identique (parcelles, produits, doses, notes...) sans écraser l'original — la date reste celle du passage source, à vérifier/modifier avant enregistrement. Voir `duplicatePassage()`.

**Duplication vers une autre exploitation** (ajoutée le 14/07/2026) : bouton "📤" supplémentaire (visible seulement si plus d'une exploitation existe), qui bascule d'abord sur l'exploitation cible choisie puis ouvre le formulaire pré-rempli. Reprend produits, doses et date, mais **efface les parcelles** (`parcelles`/`parcellesIds` remis à vide) : elles ne correspondent pas forcément d'une exploitation à l'autre, à re-sélectionner manuellement. Voir `ouvrirChoixDuplicationExploit()` / `duplicatePassageVersExploit()`.

**Correction numérotation du prochain passage** (14/07/2026) : le numéro était calculé à partir du *nombre* de passages existants sur la campagne (`length + 1`), ce qui provoquait un doublon si un passage du milieu de la séquence avait été supprimé (ex : suppression du n°3 sur 5 → le prochain nouveau passage reprenait le n°5, déjà utilisé). Corrigé : calcul désormais basé sur le **numéro maximum existant + 1** (fonction `nextPassageNum()`, utilisée pour les nouveaux passages, les duplications simples et les duplications inter-exploitations). Une suppression laisse donc volontairement un "trou" dans la numérotation plutôt que de tout renuméroter — évite d'invalider des numéros déjà exportés/imprimés.

Un passage de type `engrais` contient : `{type:'engrais', num, campagne, date, parcelles, engraisList, applicateurId, applicateurNom, applicateurSiret, notes, createdAt/updatedAt}`. Chaque entrée de `engraisList` : `{nom, categorie, qte, unite, composition: {n,p,k,mgo,so3,fe}, apportsCalcules: {n,p,k,mgo,so3,fe}}`. `apportsCalcules` = dose × % composition / 100 (apport réel en kg/ha). Hypothèse retenue : pour les engrais liquides (L/ha), 1 L ≈ 1 kg (densité proche de 1). L'applicateur peut être différent de l'exploitation, exactement comme pour les passages phyto (même logique de sélection et de copie des infos au moment du passage).

**Calcul de l'IFT** (ajouté le 21/06/2026, ajusté le 22/06/2026, 23/06/2026, 24/06/2026) : `IFT passage = Σ (dose appliquée / dose de référence IFT) × (surface réellement traitée / surface totale exploitation)`, pour chaque produit du passage **hors catégorie Biocontrôle/SDN** et **ayant une dose de référence IFT renseignée** (champ `doseReference` sur le produit ; si vide, le produit est simplement exclu du calcul, pas compté comme 0). **Surface réellement traitée** = somme des surfaces des parcelles cochées × `pourcentSurface`/100 (désherbage localisé notamment). La dose de référence IFT est distincte de la "dose recommandée" (qui reste la préconisation du technicien, modifiable à chaque passage) — saisie manuellement, car l'API officielle du ministère (ecoagri/ift v5) a été testée mais bloque les appels navigateur par CORS, et la mise en place d'un relais (Cloud Function, nécessitant le plan payant Firebase Blaze) a été jugée disproportionnée pour cet usage personnel. Surface de référence = surface totale de l'exploitation (méthode A — simplifiée, ne distingue pas les cultures en agricole). Voir la fonction `calcIFT()` dans le code. Affiché : sur chaque passage (badge IFT, et badge "X% surface" si différent de 100%), en cumul campagne sur le tableau de bord (carte "IFT Total", entre Passages et Parcelles), et dans l'export Excel (ligne "IFT" juste sous la ligne "DRE" sur la feuille Traitements, une valeur par passage).

**Ordre des catégories à l'export (feuille Traitements)** : l'ordre brut stocké dans Firestore est alphabétique (Adjuvants, Biocontrôle/SDN, Botrytis, Herbicides, Insecticides, Mildiou, Nutrition foliaire, Oïdium), ce qui ne correspond pas à la lecture agronomique souhaitée. Une séquence fixe est donc appliquée à l'export : **Adjuvants, Biocontrôle/SDN, Botrytis, Mildiou, Oïdium, Nutrition foliaire, Herbicides, Insecticides**. Toute catégorie non prévue dans cette séquence (ex : une catégorie personnalisée ajoutée plus tard) est placée à la fin, dans son ordre d'origine. Voir la constante `SEQUENCE` dans le code. **Attention** : les catégories sont stockées en MAJUSCULES dans Firestore (ex : "MILDIOU", "OIDIUM") — la comparaison est donc faite en majuscules/sans accents (`normCat()`).

### Sous-collection `exploitations/{id}/parcelles`

| Champ | Type | Description |
|---|---|---|
| `nom` | string | Nom de la parcelle |
| `surface` | number | Surface en hectares |
| `ilot` | string | Numéro d'îlot (PAC) |
| `ville` / `commune` | string | Localisation |
| `gps` | string | Coordonnées GPS (optionnel) |
| `culture` | string | Culture en place (agricole uniquement) |

### Sous-collection `exploitations/{id}/cultures`

Propre à l'exploitation agricole — liste des cultures suivies (ex : Blé tendre, Orge, Colza, Tournesol, Maïs), avec leurs stades phénologiques associés.

### Sous-collection `exploitations/{id}/campagnes`

Chemin : `exploitations/{id}/campagnes/{annee}` (ex : `"2026"`).

| Champ | Type | Description |
|---|---|---|
| `dateRecolte` | string (ISO `AAAA-MM-JJ`) | Date de récolte de la campagne, saisie dans l'onglet Export. Utilisée pour l'export et pour le calcul du badge DAR (voir section passages) |
| `recolteConfirmee` | boolean | **Ajouté le 07/07/2026**. `false`/absent = la date est **prévisionnelle** (mise à jour librement au fil de la saison à mesure qu'elle se précise) ; `true` = date **définitive**, cochée manuellement une fois la récolte réalisée. N'affecte pas le calcul du DAR, seulement le libellé affiché dans l'info-bulle du badge |

### Sous-collection `exploitations/{id}/sitesMeteo`

**Ajoutée le 07/07/2026.** Communes suivies pour la pluviométrie, configurées manuellement par l'utilisateur dans la fiche exploitation (une exploitation peut suivre une ou plusieurs communes).

| Champ | Type | Description |
|---|---|---|
| `nom` | string | Nom de la commune |
| `cp` | string | Code postal (optionnel, aide à lever l'ambiguïté au géocodage) |
| `lat` / `lon` | number | Coordonnées GPS résolues via l'API Adresse du gouvernement français (`api-adresse.data.gouv.fr`, gratuite, sans clé), sur clic du bouton "Rechercher les coordonnées". Peuvent aussi être ajustées manuellement |

**Historique d'une tentative abandonnée** : une première version détectait automatiquement des "sites" en regroupant les parcelles par proximité GPS (clustering + arrondi des coordonnées comme clé). Abandonnée le 07/07/2026 après un bug de collision entre deux sites réels trop proches pour être distingués par l'arrondi — remplacée par cette configuration manuelle, plus simple et sans ambiguïté. Voir "Points de vigilance" pour le détail du bug.

### Sous-collection `exploitations/{id}/pluviometrie`

**Ajoutée le 07/07/2026.** Historique quotidien de précipitations par site météo, un document par site et par année civile.

Chemin : `exploitations/{id}/pluviometrie/{siteId}_{annee}` (où `siteId` = l'id du document dans `sitesMeteo`, garantissant l'unicité — pas de risque de collision entre deux sites).

| Champ | Type | Description |
|---|---|---|
| `site` | string | Id du site météo (référence à `sitesMeteo`) |
| `label` | string | Nom de la commune au moment de l'enregistrement (copie, pour lisibilité) |
| `annee` | string | Année civile (ex : `"2026"`) |
| `jours` | map<string, number> | Précipitations en mm par jour, clé = date ISO (`AAAA-MM-JJ`). Alimenté jour par jour à chaque connexion (voir ci-dessous), jamais réécrit en totalité |
| `updatedAt` | timestamp | Horodatage de la dernière synchronisation |

**Fonctionnement** : à chaque connexion, l'app ne récupère que les jours manquants depuis la dernière synchronisation (source : Open-Meteo — **Historical Forecast API** pour la partie passée, qui rejoue les sorties archivées du modèle Météo-France AROME, ~1,5 à 2,5 km de résolution sur la France, disponible depuis fin 2022 ; API prévision standard pour les tout derniers jours non encore archivés). Affiché sur le tableau de bord et dans le formulaire de passage : cumul depuis le dernier traitement phyto de la campagne (hors engrais) et cumul depuis le 1er janvier, par site. Voir la fonction `syncRainfallHistory()` dans le code.

**Historique de la source météo** : la première version (07/07/2026) utilisait l'API archive ERA5 (réanalyse mondiale, 9-25 km) au-delà de 90 jours — beaucoup trop grossier pour des pluies convectives localisées. Remplacée le 08/07/2026 par la Historical Forecast API, qui offre la résolution native du modèle Météo-France plutôt qu'une réanalyse mondiale. Reste un modèle météo (pas une mesure directe de station), donc un écart avec une station locale réelle peut subsister, mais nettement réduit.

**Import CSV de stations locales (ajouté le 18/07/2026)** : pour combler l'écart résiduel avec une station Open-Meteo, un bouton "📥 Importer CSV" (fiche exploitation, section Sites météo) permet d'importer un relevé exporté par une station locale. Format attendu : séparateur `;`, dates `JJ/MM/AAAA`, une colonne `"<NOM STATION> Pluies quotidiennes (mm)"` par station suivie (les colonnes "cumulées" associées sont ignorées, le cumul est toujours recalculé par l'app). Étapes : upload/collage → analyse (détection des colonnes stations) → correspondance avec les sites météo déjà configurés (auto-détectée par normalisation nom/accents/casse, avec repli sur un menu déroulant si le nom ne correspond pas exactement, ex. "FONTAINE" ↔ "Fontaine Denis") → import. **Les valeurs importées écrasent celles déjà stockées (Open-Meteo) pour les mêmes jours** (la mesure de station est jugée plus fiable) ; les jours non couverts par le CSV restent inchangés. Les jours importés sont fusionnés dans les mêmes documents `pluviometrie/{siteId}_{annee}`, regroupés par année à partir des dates du fichier. Voir `parseCsvPluvio()` / `confirmerImportCsv()` dans le code.

**Sélection de la station affichée (ajouté le 18/07/2026)** : la carte "Pluviométrie" du tableau de bord n'affiche plus jamais une moyenne entre sites (jugée peu pertinente vu les variations locales de pluvio d'un site à l'autre). Elle affiche le cumul d'**une seule station** ; si plusieurs sites sont configurés sur l'exploitation, un appui sur la carte fait défiler les stations disponibles (`cyclePluvioStation()`), et le choix est mémorisé par exploitation via `localStorage` (clé `pluvioStationSite_{exploitationId}`, même mécanisme que la dernière exploitation consultée). Un seul site configuré : aucune interaction, comportement inchangé. Voir `getPluvioStationKey()` / `renderPluvioStat()`.

**Page "Pluviométrie" détaillée (ajoutée le 18/07/2026, revue le 18/07/2026 suite retours utilisateur)** : accessible via le lien "Voir le détail →" sous le bloc pluviométrie du tableau de bord (`page-pluviometrie`, hors barre d'onglets principale — pas de slot dédié dans `showPage()`/`map`, voir "Points de vigilance"). Sélecteurs station (si plusieurs) et année (5 dernières), stylés comme les autres sélecteurs autonomes de l'app (`border-radius:var(--r-sm)`, même gabarit que `campagne-select`, légèrement agrandis à la demande). Deux vues, sans dépendance externe (SVG/HTML/CSS vanilla) :
- **Mensuel** (vue par défaut) : un total par mois sur toute l'année (`drawPluvioMensuel()`), tient sur un écran de smartphone sans défilement. Toucher un mois bascule sur le détail quotidien de ce mois seul (`drawPluvioJourMois()`, ≤31 barres, retour via lien "← Année"). Remplace la première version (barres quotidiennes sur toute l'année, à défilement horizontal), jugée moins lisible sur mobile.
- **Cumulé** : courbe SVG de l'année sélectionnée, comparée en pointillé à l'année précédente sur la même période calendaire (pas de normale 30 ans disponible) — `drawPluvioCumule()`. Repères ajoutés le 18/07/2026 : abscisse (mois) et ordonnée (mm, 5 paliers) — affichés en HTML à côté du SVG plutôt que dans le SVG lui-même, pour éviter toute déformation du texte (le SVG est étiré horizontalement via `preserveAspectRatio="none"`).

Statistiques affichées : cumul depuis le 1er janvier, écart vs l'année précédente à période égale (le compteur "jours consécutifs sans pluie" initialement prévu a été retiré le 18/07/2026, jugé peu fiable/utile en usage réel). État en mémoire : `S.pluvioPage` (`{siteKey, year, view, mois, cache}`) — `mois` porte l'éventuel détail quotidien affiché (`null` = vue annuelle), `cache` évite une relecture Firestore lors du simple basculement d'onglet ou du drill-down. Voir `renderPluvioPage()`.

---

## Collection `bases`

Chemin : `bases/{type}/...` où `type` = `'viticole'` ou `'agricole'`.

### Sous-collection `bases/{type}/produits`

| Champ | Type | Description |
|---|---|---|
| `nom` | string | Nom commercial du produit |
| `cat` | string | Catégorie (ex : Mildiou, Oïdium, Adjuvants...) |
| `dre` | number | Délai de ré-entrée (heures) |
| `dar` | number | Délai avant récolte, en **jours** (ajouté le 21/06/2026) |
| `amm` | string | Numéro AMM (souvent vide, à compléter) |
| `qte` | number | **Dose recommandée** (ex-"Quantité", renommé le 21/06/2026) — préconisation du technicien, modifiable à chaque passage |
| `doseReference` | number\|null | **Dose de référence IFT** (ajoutée le 22/06/2026), distincte de la dose recommandée — saisie manuelle (l'API officielle du ministère existe mais est bloquée par CORS, donc non utilisée). Si `null`/vide, le produit est **exclu du calcul IFT** (ni erreur, ni 0 forcé : simplement ignoré) |
| `actif` | boolean | **Archivage** (ajouté le 23/06/2026). `true` ou absent = produit actif, sélectionnable dans les nouveaux passages. `false` = archivé : n'apparaît plus dans le formulaire de passage (sauf si déjà présent sur un passage en cours de modification), reste visible (grisé) et modifiable dans la gestion des produits, et reste pleinement utilisable dans l'historique des anciens passages |
| `favori` | boolean | **Favori** (ajouté le 23/06/2026), marqué manuellement (⭐). Les produits favoris apparaissent en premier dans leur catégorie, à la fois dans la gestion des produits et dans les pastilles de sélection du formulaire de passage. Conçu pour pouvoir évoluer plus tard vers un système automatique (ex : "derniers utilisés" calculé depuis les passages) sans changer la structure |
| `dose` | string | Dose recommandée formatée en texte (ex : "1.5L/HA") |
| `unite` | string | Unité (optionnel, déduit sinon) |
| `achatsTotal` | number | **Stock — cumul des achats** (ajouté le 14/07/2026), en unité absolue (ex : L, kg — pas /ha, à distinguer de `unite` qui est une dose/ha). Voir section "Gestion de stock" ci-dessous pour la méthode de calcul du stock affiché |
| `consommeTotal` | number | **Stock — cumul de la consommation** (ajouté le 15/07/2026), en unité absolue, tenu à jour de façon incrémentale (voir section "Gestion de stock"). Remplace le recalcul complet à chaque affichage |

### Sous-collection `bases/{type}/categories`

| Champ | Type | Description |
|---|---|---|
| `nom` | string | Nom de la categorie |
| `exclureIFT` | boolean | **Ajoute le 15/07/2026.** Si `true`, les produits de cette categorie sont exclus du calcul de l'IFT (biocontrole), quel que soit le nom de la categorie. Reglable via une case a cocher dans le formulaire de creation/modification de categorie. Remplace l'ancienne detection par sous-chaine sur le nom ("BIOCONTROLE" dans le nom normalise), devenue fragile a tout renommage. **Migration** : les categories creees avant cette date n'ont pas ce champ renseigne ; `calcIFT()` retombe alors sur l'ancienne detection par nom en filet de securite — mais il est recommande de cocher explicitement la case sur la categorie "BIOCONTROLE / SDN" existante (via le crayon d'edition) pour ne plus dependre du nom du tout. |

Liste simple de catégories de produits.
- Viticole : Mildiou, Oïdium, Biocontrôle / SDN, Adjuvants, Botrytis, Nutrition foliaire, Insecticides
- Agricole : Herbicides, Fongicides, Insecticides, Régulateurs de croissance, Adjuvants, Nutrition foliaire

### Sous-collection `bases/{type}/engrais`

Référentiel de fertilisation, séparé viticole/agricole comme les produits phytos.

| Champ | Type | Description |
|---|---|---|
| `nom` | string | Nom commercial (ex : ORGATEK) |
| `categorie` | string | NPK, Azote seul, Oligo-elements / Foliaire, Amendement organique, Amendement calcique, Autre |
| `qte` / `unite` | number / string | Dose habituelle (`kg/ha` ou `L/ha`) |
| `composition` | object | Pourcentages dans le produit : `{n, p, k, mgo, so3, fe}` (champs à 0 si non concerné — ex : chélate de fer = `fe` seul) |
| `achatsTotal` | number | **Stock — cumul des achats** (ajouté le 14/07/2026), même principe que sur les produits phyto ci-dessus |
| `consommeTotal` | number | **Stock — cumul de la consommation** (ajouté le 15/07/2026), même principe que sur les produits phyto ci-dessus |

## Gestion de stock (ajoutée le 14/07/2026, consommation passée en incrémental le 15/07/2026)

Principe : les **achats** sont saisis manuellement (champ `achatsTotal`, cumulé sur le produit ou l'engrais, en unité absolue). La **consommation** est tenue à jour dans un champ dédié `consommeTotal` (même logique de cumul), puisque le stock physique est **commun** aux exploitations viticoles CORRE et VADEZ (décision utilisateur du 14/07/2026 — ne concerne pas FIEVET, hors périmètre de cette app, gérée uniquement dans l'app vendanges pour la récolte).

**Stock actuel affiché** = `achatsTotal` − `consommeTotal`. Simple lecture des champs déjà chargés en direct via les listeners (`S.produits`/`S.engrais`) — plus de relecture de l'historique à chaque affichage.

**Mise à jour incrémentale** (`applyConsommation()`, ajoutée le 15/07/2026 en remplacement du recalcul systématique) : à chaque création, modification ou suppression d'un passage (phyto ou engrais), on calcule la consommation de ce passage (dose × surface traitée × %surface/100, résolue via `surfaceTraiteePassage()`) et on l'ajoute (`increment()`) ou on la retire du `consommeTotal` du produit/engrais concerné (retrouvé par correspondance nom+catégorie dans la base). Sur une modification, l'ancienne consommation du passage est d'abord retirée avant d'appliquer la nouvelle. Les duplications (simples ou vers une autre exploitation) n'ont pas de traitement spécifique : elles passent par le même chemin d'enregistrement qu'une création normale.

**Recalcul complet** (`recalculerConsommation()`, bouton "🔄 Recalculer" sur la page Stock) : relit tout l'historique (`passages` + `parcelles` de chaque exploitation du type, via `getDocs`) et réécrit `consommeTotal` en valeur absolue pour chaque produit/engrais. Nécessaire une seule fois pour initialiser le champ sur les produits existants (l'historique antérieur au 15/07/2026 n'a pas incrémenté `consommeTotal` automatiquement), et utilisable ensuite comme filet de sécurité en cas de doute sur la cohérence du compteur (ex. modification manuelle dans la console Firestore, bug). La fonction `fetchConsommationParType()` sous-jacente (relecture + calcul) est conservée pour cet usage ponctuel uniquement.

**Point de vigilance** : si un produit/engrais est renommé (nom ou catégorie) après avoir été utilisé dans des passages, la correspondance nom+catégorie utilisée par `applyConsommation()` pour retrouver le bon document peut ne plus matcher pour des passages futurs modifiés/dupliqués référençant l'ancien nom — un "🔄 Recalculer" après un tel renommage remet les compteurs d'aplomb.

**Interface** :
- Page dédiée "Stock" (`page-stock`), accessible via un bouton sur le tableau de bord et sur la page Produits — pas d'onglet permanent en haut (même logique que pour les Parcelles, voir plus bas). Barre de recherche par nom, classement par catégorie.
- "+ Ajouter un achat" (choix catégorie puis produit) et un "+" par ligne pour un achat rapide sur un produit déjà listé.
- "✏️ Modifier" : corrige le stock affiché à une valeur exacte (ex. après un inventaire physique) — techniquement, ajuste `achatsTotal` d'un delta calculé (nouvelle valeur − stock affiché), ne l'écrase jamais directement pour rester cohérent avec la consommation déjà comptabilisée.
- "🗑️ Remettre à zéro" : ramène le stock affiché à 0 (même mécanisme de delta). N'efface pas le produit lui-même.
- Seuls les stocks **strictement positifs** sont listés (les stocks à 0 ou négatifs sont masqués) — un stock négatif signalerait une incohérence de saisie sur un passage (dose oubliée/mal renseignée).
- Colonne "Stock" également affichée directement dans les tableaux Produits et Engrais (rafraîchissement asynchrone après le rendu de la liste, `refreshStockColumns()`).
- Sur la fiche produit/engrais (modal "Modifier"), une ligne "Stock actuel" avec son propre bouton "+" (calcul asynchrone à l'ouverture, `remplirStockModal()`) ; après un achat depuis ce modal, retour sur la même fiche (plutôt que vers la page Stock) pour rester dans le contexte.
- Export PDF (bouton "🖨️") de la liste groupée par catégorie — a nécessité l'ajout de la librairie jsPDF (absente jusque-là de cette app, contrairement à l'app vendanges qui l'utilisait déjà).

**Ancienne limite (résolue le 15/07/2026)** : le recalcul relisait l'intégralité des passages et parcelles des exploitations concernées à chaque ouverture. Résolu par le passage à `consommeTotal` incrémental ci-dessus ; la relecture complète (`recalculerConsommation()`) ne sert plus qu'à l'initialisation ou en filet de sécurité ponctuel.

### Sous-collection `bases/{type}/applicateurs`

| Champ | Type | Description |
|---|---|---|
| `nom` | string | Nom de l'applicateur |
| `siret` | string | SIRET (si différent de l'exploitation) |
| `certiphyto` | string | Référence Certiphyto (le cas échéant) |

---

## Points de vigilance connus

- **SIRET** : peut être importé/affiché en notation scientifique depuis Excel — vérifier le format en string, pas en number.
- **Scinder une parcelle sans casser l'historique** (ajouté le 23/06/2026) : les passages créés à partir du 23/06/2026 référencent les parcelles par identifiant stable (`parcellesIds`), donc résistants à un renommage. Mais les passages **antérieurs** à cette date n'ont que le nom (`parcelles`), sans id. Pour scinder une parcelle groupée sans rien casser : **garder le document existant (même id) pour l'une des deux nouvelles parcelles, en gardant son nom d'origine inchangé** (juste réduire sa surface), et **créer un nouveau document séparé** pour l'autre partie. Renommer le document existant romprait le lien des anciens passages (avant le 23/06/2026) qui le référencent par nom.
- **Collections vs typos** : un nom de collection mal orthographié (`produit` au lieu de `produits`) crée une collection vide à côté sans erreur visible. Toujours vérifier l'orthographe exacte ci-dessus avant d'ajouter du code.
- **Stades phénologiques** : différents selon viticole (BBCH unique) ou agricole (un jeu de stades par culture, voir `STADES_AGRICOLE` dans le code).
- **État partagé entre exploitations** (appris le 07/07/2026) : un état en mémoire partagé (variable globale unique, ex. un tableau non indexé par exploitation) peut se faire écraser par les données d'une autre exploitation si un appel asynchrone en cours (ex. lecture Firestore, appel API) se termine après un changement d'exploitation. Deux garde-fous à appliquer systématiquement pour tout nouvel état par exploitation : (1) stocker sous forme de dictionnaire indexé par id d'exploitation plutôt qu'un tableau/valeur unique partagé, et (2) dans tout callback asynchrone qui met à jour l'affichage, vérifier que l'exploitation active n'a pas changé entre le lancement de l'appel et sa résolution avant d'appliquer le résultat. Bug rencontré et corrigé sur `sitesMeteo`/`pluviometrie` : voir historique 07/07/2026.
- **Dépendances à des API externes gratuites, sans clé** : Open-Meteo (prévision + archive, pluviométrie) et l'API Adresse du gouvernement français (géocodage des communes). Aucune n'est garantie contractuellement disponible indéfiniment ; en cas de panne, l'app doit échouer de façon visible (message d'erreur explicite) plutôt que silencieusement (ex. afficher "0 mm" comme si c'était une vraie mesure) — voir le traitement des erreurs dans `fetchDailyPrecip()`.
- **Echappement HTML des champs texte libres** (ajouté le 15/07/2026) : une fonction `esc()` échappe désormais les caractères `< > & " '` avant insertion des champs texte libres (notes, noms de produits/engrais/parcelles/exploitations/applicateurs/catégories, SIRET, Certiphyto, communes) dans l'affichage (`innerHTML`). Avant ce correctif, un caractère comme `<` tapé dans une note pouvait casser l'affichage de la page sans message d'erreur. Les valeurs d'attributs utilisées par le JavaScript (`value=`, `data-nom=`, arguments `onclick`) ne sont volontairement pas passées par `esc()` pour ne pas casser les correspondances/échappements JS existants — seul le texte affiché à l'écran est concerné.
- **Onglet Parcelles retiré de la barre de navigation principale** (14/07/2026) : jugé inutile en accès permanent. Accessible désormais via un bouton "🗺️ Gérer les parcelles" sur la carte de l'exploitation active, dans l'onglet "Exploitations" — la sous-collection `exploitations/{id}/parcelles` est inchangée, seul le point d'entrée dans l'interface a changé. **Piège rencontré** : la fonction `showPage()` surligne l'onglet actif via une position fixe dans un tableau (`map`) ; retirer un onglet de la barre du haut décale tous les index suivants — bien vérifier/mettre à jour cette constante à chaque ajout/retrait d'onglet.
- **Carte tableau de bord "Pluviométrie"** (14/07/2026, ajustée le 18/07/2026) : remplace l'ancienne carte "Parcelles" (simple compteur jugé peu utile) par le cumul de pluviométrie depuis le 1er janvier. Le bloc détaillé plus bas sur le tableau de bord ne montre désormais plus que la ligne "depuis le dernier traitement" — le cumul annuel étant remonté dans la carte, la ligne "depuis le 1er janvier" du bloc détaillé a été retirée pour éviter la redondance. Le bloc pluviométrie a aussi été retiré du formulaire de saisie d'un passage (purement informatif à cet endroit, alourdissait la saisie sans être utilisé). **18/07/2026** : la moyenne entre sites météo initialement affichée a été abandonnée (jugée peu justifiée par l'utilisateur vu les variations locales de pluvio) au profit d'une station unique sélectionnée par appui sur la carte — voir la sous-collection `pluviometrie` ci-dessus pour le détail.
- **Pages hors barre d'onglets principale** (appris le 14/07/2026 avec Parcelles, confirmé le 18/07/2026 avec Pluviométrie) : `showPage()` peut afficher une page (`page-{nom}`) sans qu'elle corresponde à un onglet dans `map` — dans ce cas aucun onglet ne se surligne, ce qui est acceptable pour une page atteinte via un lien contextuel plutôt que la navigation principale (ex. "Voir le détail →" depuis le tableau de bord). Ne pas confondre avec un oubli : vérifier si l'absence de surlignage est voulue avant d'ajouter une entrée dans `map`.
- **Import CSV pluviométrie et exploitations multiples** (bug identifié et corrigé le 20/07/2026) : la pluviométrie est stockée séparément par exploitation (`exploitations/{id}/pluviometrie`), y compris quand CORRE et VADEZ suivent la même station de référence. `confirmerImportCsv()` propage désormais un import vers toute exploitation possédant un site météo du **même nom** (comparaison normalisée via `normText`, insensible à la casse/accents — mais pas aux fautes de frappe : un nom de site orthographié différemment entre deux exploitations ne sera pas reconnu comme identique). **Piège corrigé** : la première version de ce correctif s'appuyait sur `S.sitesMeteoByExploit`, qui n'est peuplé en mémoire que pour les exploitations déjà activées durant la session en cours (à cause du `listenExploit()` qui coupe les listeners de l'exploitation précédente à chaque changement) — une exploitation jamais consultée depuis le dernier rechargement de page était donc silencieusement ignorée. La version corrigée va chercher ces sites directement en base (`getDocs`) à chaque import, indépendamment de l'historique de navigation de la session.

---

## Historique des évolutions de structure

| Date | Changement |
|---|---|
| 20/06/2026 | Ajout authentification anonyme (Firebase Auth) + règles Firestore restrictives (`request.auth != null`) |
| 20/06/2026 | Ajout du bouton de sauvegarde JSON complète (onglet Export) — ne modifie pas la structure, lit toutes les collections ci-dessus |
| 20/06/2026 | Ajout de la fertilisation : nouvelle sous-collection `bases/{type}/engrais`, nouveau champ `type` ('phyto'/'engrais') sur les passages avec `engraisList` dedie aux passages engrais, calcul automatique des apports N/P/K/MgO/SO3/Fe, sous-onglets Phyto/Engrais sur les pages Produits et Passages (numerotation independante), nouvel onglet d'export Excel "Engrais {campagne}" |
| 20/06/2026 | Ajout de l'applicateur et du bouton GPS sur le formulaire passage engrais (parite avec le formulaire phyto). Export : colonnes Parcelles/Commentaires deplacees en fin de tableau sur la feuille Engrais ; regroupement des categories sur la feuille Traitements (maladies, puis Herbicides, puis Insecticides) |
| 20/06/2026 | Correction : le tri des categories sur la feuille Traitements ne s'appliquait pas car les noms reels sont stockes en MAJUSCULES (comparaison desormais insensible a la casse/accents). Ajout de la colonne Applicateur sur la feuille Engrais, juste avant Commentaires |
| 21/06/2026 | Ajustement de l'ordre des categories sur la feuille Traitements : sequence fixe explicite Adjuvants, Biocontrole/SDN, Botrytis, Mildiou, Oidium, Nutrition foliaire, Herbicides, Insecticides (l'ordre brut stocke en base etant alphabetique, donc peu fiable pour ce besoin) |
| 21/06/2026 | Ajout du champ `dar` (delai avant recolte, en jours) sur les produits. Renommage de l'etiquette "Quantite" en "Dose recommandee" (champ `qte` inchange en base). Ajout du calcul automatique de l'IFT par passage (`calcIFT()`, hors biocontrole, methode A = surface totale exploitation), stocke dans `ift` sur le passage, affiche en badge sur chaque passage, cumule sur le tableau de bord (carte IFT Total), et exporte en ligne dediee sous le DRE sur la feuille Traitements |
| 22/06/2026 | API officielle du ministere (ecoagri/ift v5) testee pour recuperer AMM/doses de reference : fonctionne en appel direct mais bloquee par CORS depuis un navigateur, donc abandonnee (aurait necessite un relais Cloud Function + plan payant Firebase Blaze, disproportionne pour cet usage personnel). A la place : nouveau champ `doseReference` (optionnel) sur les produits, distinct de la dose recommandee, saisi manuellement. Le calcul IFT utilise desormais cette dose de reference (`doseReferenceIFT` snapshotee sur le passage) ; un produit sans dose de reference renseignee est simplement exclu du calcul IFT |
| 23/06/2026 | Ajout de l'archivage des produits (champ `actif`, false = archive) pour gerer la croissance de la base sans perdre l'historique : bouton archiver/reactiver, produits archives grises et exclus de la selection sur les nouveaux passages mais conserves dans la gestion et l'historique. Ajout d'un champ de recherche texte sur la page Produits (`S.produitsFiltre`) |
| 23/06/2026 | Ajout des favoris produits (champ `favori`, marquage manuel via etoile) : les favoris apparaissent en premier dans leur categorie, en gestion des produits et dans les pastilles du formulaire de passage. Pensee pour evoluer plus tard vers un calcul automatique (derniers utilises / frequents) sans changer la structure |
| 23/06/2026 | Ajout du champ `parcellesIds` sur les passages (phyto et engrais), en parallele de `parcelles` (noms, inchange) : resout le risque qu'un renommage de parcelle casse l'historique. `calcIFT()` resout desormais la surface par id en priorite, avec repli sur le nom pour les passages anterieurs (sans migration retroactive necessaire). Voir la note dans "Points de vigilance" sur la procedure a suivre pour scinder une parcelle sans casser l'historique |
| 24/06/2026 | Ajout du champ `pourcentSurface` sur les passages phyto (defaut 100), pour le desherbage localise (ex: 66% de la parcelle traitee). Le calcul IFT (`calcIFT()`) applique desormais ce pourcentage a la surface traitee. Badge "X% surface" affiche sur le passage si different de 100%. La mention "X% de la surface traitee" s'insere automatiquement dans les notes affichees sur le passage et dans la colonne Notes de l'export Excel |
| 05/07/2026 | Correction bug badge IFT affichant "undefined" sur certains passages (distinction null vs undefined, protection try/catch sur le calcul du badge). Correction bug champ de recherche produits (S non accessible depuis oninput HTML dans un module JS, remplace par window.filtreProduits()). Uniformisation de la gestion null/undefined sur le total IFT du dashboard et la ligne IFT de l'export |
| 07/07/2026 | Ajout de la duplication de passage (bouton "Dupliquer", phyto et engrais) |
| 07/07/2026 | Pluviometrie automatique (1ere version) : detection automatique de "sites" par clustering GPS des parcelles (seuil 3km, cle = centroide arrondi ~11km). Affichage cumul depuis le dernier traitement + depuis le 1er janvier, calcul a la volee (non persiste) |
| 07/07/2026 | Pluviometrie : passage a un historique quotidien persiste (nouvelle sous-collection `pluviometrie`, jours manquants recuperes a chaque connexion via Open-Meteo prevision/archive), pour lever la limite de 92 jours de l'API prevision et permettre un cumul depuis le 1er janvier fiable |
| 07/07/2026 | Correction bugs pluviometrie : (1) echecs API silencieux affichant un faux "0 mm" (ajout de la verification des reponses HTTP), (2) synchro figee apres un echec (retry automatique au lieu d'un cache permanent), (3) synchro non isolee par exploitation (contamination croisee) |
| 07/07/2026 | Pluviometrie : abandon du clustering GPS automatique (risque de collision entre deux sites reels proches apres arrondi) au profit d'une configuration manuelle des sites meteo par l'utilisateur — nouvelle sous-collection `sitesMeteo` (nom de commune + GPS resolu via l'API Adresse du gouvernement francais), badge par passage retire (vue globale uniquement : tableau de bord + formulaire de passage) |
| 07/07/2026 | Correction bug de contamination croisee entre exploitations sur les sites meteo : passage d'un tableau partage a un dictionnaire indexe par exploitation (`S.sitesMeteoByExploit`), pour empecher structurellement qu'un callback tardif d'une exploitation n'ecrase les donnees d'une autre (voir "Points de vigilance") |
| 07/07/2026 | Ajout du champ `recolteConfirmee` sur `campagnes/{annee}` (case a cocher "Date confirmee" dans l'onglet Export) : distingue date de recolte previsionnelle (mise a jour librement en cours de saison) et definitive (recolte realisee) |
| 07/07/2026 | Ajout du badge DAR relie a la date de recolte de la campagne (compare la date de recolte sure du passage a `dateRecolte`), simplifie a l'affichage en "DAR OK" / "DAR NON" (details en info-bulle) |
| 07/07/2026 | Affichage de la derniere exploitation consultee en tete de liste dans l'onglet Exploitations (le mecanisme de reactivation automatique via localStorage existait deja ; seul l'ordre d'affichage de la liste a ete corrige) |
| 08/07/2026 | Pluviometrie : remplacement de l'API archive ERA5 (9-25km, reanalyse mondiale) par la Historical Forecast API d'Open-Meteo (modele Meteo-France AROME, ~1,5-2,5km sur la France) pour toute la partie historique, pour un gain de precision significatif sur les cumuls |
| 14/07/2026 | Retrait du bloc pluviometrie (purement informatif) du formulaire de saisie d'un passage, pour alleger la presentation |
| 14/07/2026 | Formulaire de passage (phyto et engrais) : champs "Passage N" et "DRE max" sortis de la grille principale, passes en lecture seule ; champ "% surface traitee" masque par defaut (affiche uniquement sur demande ou si different de 100% sur un passage existant) |
| 14/07/2026 | Tableau de bord : la carte "Parcelles" (simple compteur) est remplacee par une carte "Pluviometrie" (cumul depuis le 1er janvier). Le bloc detaille ne montre plus que le cumul "depuis le dernier traitement" (redondance supprimee) |
| 14/07/2026 | Ajout de deux liens externes au-dessus de la liste des produits phyto : recherche E-Phy (ANSES) et doses de reference IFT 2026 (ecoagri). Un essai de pre-remplissage de la recherche E-Phy par nom de produit (parametre `search_api_aggregation_3`) s'est avere peu fiable en usage reel et a ete abandonne au profit de liens generiques |
| 14/07/2026 | Ajout de la gestion de stock (produits phyto et engrais) : nouveau champ `achatsTotal`, nouvelle page "Stock", colonne Stock dans les tableaux Produits/Engrais, ligne stock + achat rapide dans les fiches produit/engrais, export PDF (ajout de la librairie jsPDF). Voir section dediee "Gestion de stock" |
| 14/07/2026 | Ajout de la duplication de passage vers une autre exploitation (bouton distinct de la duplication simple existante) |
| 14/07/2026 | Correction : le numero du prochain passage se basait sur le nombre de passages existants au lieu du numero maximum existant, provoquant un doublon possible apres suppression d'un passage au milieu de la sequence (voir section Passages) |
| 14/07/2026 | Retrait de l'onglet "Parcelles" de la barre de navigation principale ; gestion des parcelles deplacee vers un bouton sur la carte de l'exploitation active (onglet Exploitations) |
| 14/07/2026 | Bouton "Archiver/Reactiver" un produit : deplace de la ligne du tableau Produits vers l'interieur du modal "Modifier le produit", pour alleger la liste |
| 15/07/2026 | Stock : passage de la consommation recalculee a chaque affichage a un compteur incremental (`consommeTotal`), mis a jour a chaque creation/modification/suppression de passage (`applyConsommation()`). Ajout du bouton "Recalculer" (page Stock) pour initialiser/reparer ce compteur via un recalcul complet ponctuel (`recalculerConsommation()`, reutilise `fetchConsommationParType()`) |
| 15/07/2026 | Ajout d'une fonction d'echappement HTML (`esc()`), appliquee aux champs texte libres affiches (notes, noms, SIRET, Certiphyto, communes...) pour eviter qu'un caractere comme `<` tape par erreur ne casse l'affichage |
| 15/07/2026 | Ajout du champ explicite `exclureIFT` sur les categories (case a cocher "Categorie de biocontrole") : `calcIFT()` se fie desormais a ce champ plutot qu'a une detection par sous-chaine sur le nom de la categorie, plus fragile a un renommage |
| 15/07/2026 | Tableau de bord : ajout d'une carte "Delai avant recolte (DAR)" (`renderDarSummary()`) resumant, sur l'ensemble des passages de la campagne, la date de recolte sans risque la plus tardive, comparee a la date de recolte prevue/confirmee si renseignee |
| 15/07/2026 | Sauvegarde automatique quotidienne (`verifierSauvegardeAuto()`, declenchee au premier chargement de la page, une fois par jour par appareil via `localStorage`) : ecrit le meme dump complet que l'export JSON manuel dans une nouvelle collection Firestore `backups`, en ne conservant que les 20 sauvegardes les plus recentes (`NB_BACKUPS_MAX`) |
| 15/07/2026 | `saveEditCat()` : remplacement de `setDoc({...produit, cat})` par `updateDoc({cat})` lors du renommage d'une categorie, pour ne modifier que le champ `cat` sans risquer d'ecraser une modification concurrente sur le reste du produit |
| 15/07/2026 | Page Stock : affichage de la date du dernier recalcul complet (`stock-recalc-info`, alimente par un nouveau champ `derniereRecalculConsommation` sur le document `bases/{type}`), avec incitation visuelle si le dernier recalcul date de plus de 60 jours |
| 18/07/2026 | Ajout de l'import CSV de pluviometrie depuis des stations locales (bouton "Importer CSV", section Sites meteo) : parse un export multi-stations (separateur `;`, dates JJ/MM/AAAA), fait correspondre chaque colonne station a un site meteo configure (auto-detection par nom normalise, repli manuel sinon), et fusionne les valeurs dans `pluviometrie/{siteId}_{annee}` en ecrasant les valeurs Open-Meteo existantes pour les memes jours |
| 18/07/2026 | Carte tableau de bord "Pluviometrie" : abandon de la moyenne entre sites au profit d'une station unique, selectionnable par appui sur la carte si plusieurs sites sont configures (`cyclePluvioStation()`), avec memorisation du choix par exploitation (`localStorage`) |
| 18/07/2026 | Ajout d'une page "Pluviometrie" dediee (`page-pluviometrie`, lien "Voir le detail" depuis le tableau de bord) : vues Quotidien (barres) et Cumule (courbe SVG comparee a l'annee precedente), selecteurs station/annee, stats cumul/ecart annee precedente/jours sans pluie consecutifs. Pas de dependance externe (SVG/HTML/CSS vanilla) |
| 18/07/2026 | Page Pluviometrie, ajustements suite retours utilisateur (notes Notion) : (1) selecteurs station/annee agrandis et arrondis pour matcher le style des autres pages, (2) vue "Quotidien" remplacee par "Mensuel" (total par mois sur toute l'annee, tient sur un ecran de smartphone sans defilement), avec detail quotidien d'un mois accessible en touchant sa barre (`drawPluvioJourMois()`), (3) vue "Cumule" : ajout de reperes ordonnee (mm) et abscisse (mois) |
| 18/07/2026 | Tableau de bord : retrait du bouton "Stock rapide" (deja disponible sur la page Produits, jugee plus logique). Page Pluviometrie : mention "Toucher un mois pour le detail" deplacee sous le graphique mensuel (au lieu d'au-dessus), espace legerement augmente entre les onglets Mensuel/Cumule et le graphique, retrait du compteur "Jours sans pluie" (juge peu fiable/utile) |
| 19/07/2026 | Modularisation du code JavaScript : `index.html` (un seul fichier de ~3860 lignes) scinde en 8 modules ES dans `js/` (`utils`, `state`, `firebase-data`, `pluviometrie`, `produits-stock`, `passages`, `crud-annexes`, `export`) + un orchestrateur restant inline (~823 lignes). Aucun changement de comportement fonctionnel, uniquement organisationnel. Voir section dediee "Architecture du code (fichiers JS)" |
| 20/07/2026 | Ajout d'un lien "meteo.comitechampagne.fr" en haut de la page Pluviometrie detaillee (HTML statique, aucune logique JS) : renvoie vers le site source du CSV de pluviometrie importe manuellement (bouton "Importer CSV", section Sites meteo) |
| 20/07/2026 | Correction `confirmerImportCsv()` : un import CSV met desormais a jour toutes les exploitations possedant un site meteo du meme nom (recherche directe en base via `getDocs`, plus fiable que l'ancienne version qui dependait de l'historique de navigation de la session). Voir "Points de vigilance" |
| 20/07/2026 | Correction import CSV pluviometrie (js/pluviometrie.js, confirmerImportCsv) : l'import n'ecrivait que dans l'exploitation active (S.currentId), causant un ecart de pluviometrie entre CORRE et VADEZ meme avec la meme station de reference. Desormais, l'import detecte automatiquement les sites meteo du meme nom (normText) dans les autres exploitations et y ecrit aussi les memes donnees en un seul import |

## Sauvegarde automatique (ajoutee le 15/07/2026)

Une collection Firestore de premier niveau `backups/{id}` reçoit, une fois par jour au premier chargement de la page (verifie via `localStorage.derniereSauvegardeAutoDate`, donc une fois par jour et par appareil utilise), le meme dump complet que produit l'export JSON manuel (`construireDumpComplet()`, factorisee entre les deux usages). Seules les 20 sauvegardes les plus recentes sont conservees (nettoyage automatique des plus anciennes a chaque nouvelle sauvegarde). Echec silencieux (log console uniquement) pour ne jamais bloquer l'usage normal de l'appli si l'ecriture echoue.

**Limite connue** : le declenchement "une fois par jour" est mesure par appareil (via `localStorage`), pas de façon centralisee — si vous utilisez l'appli sur plusieurs appareils, chacun peut declencher sa propre sauvegarde le meme jour (redondant mais sans consequence, juste des ecritures Firestore en plus). A l'inverse, si l'appli n'est jamais ouverte un jour donne, aucune sauvegarde n'est faite ce jour-la (pas de sauvegarde en arriere-plan hors utilisation).

*(À compléter à chaque ajout futur — indiquer la date, la collection/le champ ajouté, et le type de donnée.)*

**Reste ouvert (idées notées, non implémentées)** : prévisions météo à 5 jours sur la page Pluviométrie ; affichage éventuel des relevés de plusieurs stations côte à côte pour validation croisée.
