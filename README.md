# LitFlow

**Application libre et gratuite pour mener une revue systématique de littérature, directement connectée à Zotero.**

LitFlow s’inspire de Covidence et de Rayyan, mais avec une idée différente : **Zotero reste la source de vérité**.
Vos références ne sont jamais réimportées ni converties : LitFlow les lit dans votre bibliothèque Zotero et y
écrit, au fur et à mesure, le résultat de chaque étape (collections, étiquettes, notes). Les titres, résumés et
accents restent exactement comme dans Zotero.

> 🧪 Version 0.1 : fonctionnelle mais jeune. Faites des sauvegardes (export JSON) et signalez les problèmes dans
> les *issues* GitHub.

---

## Ce que fait LitFlow

| Étape | Dans LitFlow | Ce qui apparaît dans Zotero |
|---|---|---|
| **1. Protocole** | Type de revue, question, cadre **PICO, PICOS, PICOT, PECO, PEO, PCC, SPIDER, SPICE, ECLIPSE** ou personnalisé, critères d’inclusion/exclusion, mots-clés à surligner | — |
| **2. Identification** | Lecture d’une collection Zotero ; chaque sous-collection = une source (PubMed, Cairn, Érudit…) | Rien n’est modifié |
| **3. Doublons** | Détection par DOI, titre identique et titres très proches (accents et majuscules ignorés pour comparer, jamais supprimés) | Collection `0 – Doublons` + étiquette `LF:doublon` |
| **4. Tri titre-résumé** | Cartes à glisser : **← exclure, → inclure, ↑ incertain** (ou clavier). Choix rapide de la raison, ou nouvelle raison mémorisée, ou « Passer » | Collections `1 – Tri titre-résumé · Inclus / Exclus / Incertains`, étiquettes `LF:tri:exclu`, `LF:tri:raison:Hors sujet`… |
| **5. Texte intégral** | Même interface + notes de lecture, liens vers les PDF de Zotero, « texte introuvable » | `2 – Texte intégral · Exclus / Incertains / Introuvables`, `3 – Inclus dans la revue`, note enfant « LitFlow » avec raisons et notes |
| **PRISMA 2020** | Diagramme calculé automatiquement (français ou anglais), avec colonne « autres méthodes », export **SVG et PNG** | — |
| **Références** | Tableau filtrable (type de document, langue, source, années, nombre de pages, résumé, étiquettes Zotero…), décisions groupées, export **CSV** (s’ouvre avec les accents dans Excel) | — |

**La synchronisation marche dans les deux sens** : vous pouvez aussi décider directement dans Zotero (pratique
pendant la lecture des PDF). Ajoutez par exemple les étiquettes `LF:texte:exclu` et `LF:texte:raison:Mauvaise
population`, ou glissez l’item dans la collection `2 – Texte intégral · Exclus` : LitFlow le lit toutes les
45 secondes et met à jour ses décisions et le diagramme PRISMA. Les nouvelles références ajoutées aux collections
sources sont aussi détectées.

Vos autres collections et étiquettes Zotero ne sont **jamais** touchées : LitFlow ne gère que ce qu’il a créé
(la collection `LitFlow – nom du projet` et les étiquettes qui commencent par `LF:`).

## Démarrer (sans rien installer)

1. Ouvrez l’application en ligne : **https://wicrian.github.io/LitFlow/** *(une fois GitHub Pages activé, voir
   plus bas)*. Vous pouvez d’abord cliquer sur **« Essayer avec des données de démonstration »**.
2. Créez une clé API Zotero : <https://www.zotero.org/settings/keys/new>
   - cochez **Allow library access** et **Allow write access** ;
   - pour travailler en équipe, donnez aussi l’accès en lecture/écriture aux **groupes**.
3. Dans LitFlow : ⚙️ **Connexion Zotero** → collez la clé.
4. Créez un projet → onglet **Identification** → choisissez la bibliothèque puis la collection de vos résultats.

### Organisation conseillée dans Zotero

```
📁 Ma revue – santé mentale          ← la collection à choisir dans LitFlow
   📁 PubMed                          ← une sous-collection par base de données
   📁 Cairn
   📁 Érudit
   📁 Recherche par citations         ← « autre méthode » dans PRISMA
📁 LitFlow – Ma revue                 ← créée automatiquement par LitFlow
   📁 0 – Doublons
   📁 1 – Tri titre-résumé · Inclus
   📁 1 – Tri titre-résumé · Exclus
   📁 1 – Tri titre-résumé · Incertains
   📁 2 – Texte intégral · Exclus
   📁 2 – Texte intégral · Incertains
   📁 2 – Texte intégral · Introuvables
   📁 3 – Inclus dans la revue
```

Astuce : dans Zotero, le **sélecteur d’étiquettes** (en bas à gauche) permet de filtrer par raison d’exclusion,
par exemple `LF:tri:raison:Mauvaise population`.

### Raccourcis clavier (tri)

| Touche | Action |
|---|---|
| `→` ou `I` | Inclure |
| `←` ou `E` | Exclure |
| `↑` ou `U` | Incertain |
| `↓` / `P` | Passer / précédente |
| `Z` | Annuler la dernière décision |
| `1`…`9` | Choisir une raison · `Entrée` valider · `Échap` passer |

## Assistant IA local (facultatif)

À activer dans **Protocole › Assistant IA local**. Un petit modèle multilingue (*multilingual-e5-small*, environ
120 Mo) est téléchargé **une seule fois** puis tourne dans le navigateur : vos références ne sont envoyées à aucun
service d’IA.

- **Doublons « de sens »** : repère des doublons que les règles manquent (titre traduit, prépublication et
  article publié…). Seuil réglable ; chaque groupe reste à confirmer.
- **Deuxième avis au tri** : propose inclure / exclure / incertain avec une raison lisible, d’abord en comparant
  le titre et le résumé à vos critères (PICO, inclusion, exclusion), puis en **apprenant de vos décisions**
  (« Ressemble à une référence que vous avez exclue (Hors sujet) : … »).
- **Accord avec l’IA** : pourcentage d’accord et **kappa de Cohen**, calculés uniquement sur les décisions prises
  après la suggestion, et filtre « Revoir les désaccords ».
- La suggestion peut s’afficher avant votre décision, seulement après (plus rigoureux : évite d’être influencé·e),
  ou jamais.

⚠️ L’IA compare le sens des textes ; elle ne « comprend » pas vos critères comme une personne et se trompe
souvent. Elle ne remplace pas un second évaluateur humain dans une revue systématique publiée ; mentionnez son
usage dans votre méthode.

## Organiser à votre façon (catégories et marqueurs)

L’onglet **Organisation** permet de ranger les références selon votre logique : sections du mémoire, concepts,
type d’étude, suivi de lecture, ou un plan vide. Ce classement s’utilise seul ou en complément du parcours de revue
systématique (tri, texte intégral, PRISMA) : on peut commencer par l’un, ajouter l’autre ensuite, ou ne jamais
faire de tri. Une référence peut être classée à tout moment, quelle que soit sa décision de tri (ex. exclue pour la
question de recherche, gardée pour la méthodologie).

- **Catégories** (2 niveaux) → sous-collections Zotero dans `LitFlow – projet › 4 – Organisation · nom du plan`,
  ou dans une **collection Zotero existante** que LitFlow reprend et continue à développer.
- **Marqueurs** (⭐ Important, 📌 À citer…) → étiquettes `LF:marqueur:…` ; cliquer sur un marqueur filtre les références.
- **Tableau en colonnes** : glisser-déposer à la souris (Alt = copier dans une 2e catégorie), toucher une carte sur
  tablette pour la classer ; boutons de classement rapides pendant le tri et le texte intégral ; classement groupé
  depuis l’onglet Références.
- **Dans les deux sens** : glisser une référence dans une de ces sous-collections dans Zotero, en créer, renommer ou
  supprimer une, ajouter une étiquette `LF:marqueur:…` : LitFlow le reprend.
- **Supprimer une catégorie** supprime la sous-collection Zotero mais **jamais les références** : LitFlow demande
  s’il faut les remettre « à classer », les déplacer dans une autre catégorie ou leur donner un marqueur.

## Reprendre un tri commencé dans Rayyan

Onglet **Identification › Reprendre un tri fait dans Rayyan** : choisissez le fichier `articles.csv` de l’export
Rayyan (CSV). Seules les décisions sont reprises (avec raisons d’exclusion et labels, ces derniers devenant des
étiquettes `LF:rayyan:…`) : chaque ligne est rapprochée de la référence Zotero correspondante (DOI, titre, puis
titre proche), dont le texte d’origine est conservé. Les références que Rayyan avait fusionnées comme doublons
sont marquées « doublon ». Un aperçu montre les rapprochements à vérifier et les références introuvables avant
d’importer.

## Reprendre une revue sur un autre appareil

Chaque revue liée à Zotero est sauvegardée automatiquement (protocole, raisons, décisions, notes, réglages) dans
une note de la collection `LitFlow – nom du projet`, avec l’étiquette `LitFlow-projet`. Sur un autre appareil
(iPad, autre ordinateur) ou après avoir vidé le navigateur : **Accueil › Reprendre depuis Zotero**. Les références
sont relues dans Zotero et les décisions prises entre-temps dans Zotero (étiquettes `LF:`) sont reprises.

Conseil : travaillez sur un appareil à la fois. Les décisions passent d’un appareil à l’autre par Zotero, mais
une modification du protocole faite sur l’un n’apparaît sur l’autre qu’en reprenant la revue depuis Zotero.

## Confidentialité

- LitFlow n’a **pas de serveur** : c’est une page web qui fonctionne entièrement dans votre navigateur.
- Vos projets sont enregistrés dans le navigateur (IndexedDB). Utilisez **Références › Sauvegarder le projet**
  pour changer d’ordinateur ou partager.
- La clé API Zotero est stockée dans le navigateur et n’est envoyée qu’à `api.zotero.org`.
- L’assistant IA télécharge son programme (jsDelivr) et son modèle (Hugging Face) ; aucun texte n’est envoyé.

## Travailler en équipe

Aujourd’hui : utilisez une **bibliothèque de groupe Zotero**. Chaque membre voit dans Zotero les collections et
étiquettes créées par LitFlow. Le double tri en aveugle avec gestion des désaccords (comme dans Covidence) est
prévu dans la feuille de route.

---

## Pour les développeuses et développeurs

Pile technique volontairement simple : **React + TypeScript + Vite**, aucune dépendance serveur.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests (logique, doublons, PRISMA, synchronisation avec un faux serveur Zotero)
npm run build    # version statique dans dist/ (à héberger n’importe où)
```

```
src/
  types.ts              Modèle de données (projet, références, décisions)
  store.tsx             État du projet, sauvegarde locale, synchronisation automatique
  zotero/api.ts         Client de l’API Web Zotero v3
  zotero/sync.ts        Import depuis Zotero et écriture des collections/étiquettes/notes
  zotero/mapping.ts     Conversion item Zotero → référence (sans modifier le texte)
  zotero/pull.ts        Lecture des changements faits dans Zotero (sync dans les deux sens)
  ai/                   Assistant IA local (modèle dans un Web Worker, logique testée)
  lib/agreement.ts      Kappa de Cohen
  lib/dedup.ts          Détection des doublons
  lib/prisma.ts         Calcul des chiffres PRISMA 2020
  lib/filters.ts        Filtres et tris sur les métadonnées
  lib/frameworks.ts     Cadres PICO, SPIDER, PCC… et raisons par défaut
  components/           Écrans (Protocole, Identification, Doublons, Tri, Références, PRISMA)
```

### Publier sa propre copie

1. *Fork* du dépôt sur GitHub.
2. **Settings › Pages › Source : GitHub Actions**.
3. Chaque push sur la branche par défaut lance les tests puis publie le site (`.github/workflows/deploy.yml`).

Le dossier `dist/` produit par `npm run build` peut aussi être déposé sur n’importe quel hébergement statique
(serveur universitaire, Netlify…).

### Feuille de route (idées)

- [ ] **FAQ « Sécurité et confidentialité » dans l’application** (ex. « LitFlow peut-il abîmer mon Zotero ? »,
      « Qui peut voir ma revue ? ») + court texte de présentation pour rassurer les nouveaux utilisateurs
- [ ] Stockage « permanent » du navigateur + rappel de sauvegarde
- [ ] Héberger le programme de l’assistant IA avec LitFlow (au lieu de jsDelivr)
- [x] Autres thèmes de couleurs : classique, chaleureux, moderne, plein air
- [ ] Organisation : vue libre (zones à dessiner sur une grande surface)
- [ ] Organisation : catégorie suggérée par l’IA locale

- [ ] Double tri en aveugle entre personnes, résolution des conflits (le kappa existe déjà pour l’IA)
- [ ] Assistant IA : explications rédigées par un modèle de langage local (Ollama), en option
- [ ] Grille d’extraction de données personnalisable, export tableur
- [ ] Évaluation de la qualité / du risque de biais (CASP, MMAT, RoB 2…)
- [ ] Interface en anglais et autres langues
- [x] Import des décisions Rayyan
- [ ] Import des décisions Covidence
- [ ] Extension Zotero 7 (tri directement dans Zotero)

Les contributions sont bienvenues : ouvrez une *issue* pour en discuter.

## Licence

[GNU AGPL v3 ou ultérieure](LICENSE) — la même famille de licence que Zotero. Vous pouvez utiliser, modifier et
redistribuer LitFlow librement ; toute version modifiée mise à disposition en ligne doit rester libre.
