# Application d'envoi de campagnes email (mail_sender)

## Contexte

Outil interne pour envoyer un email (rédigé comme brouillon dans une boîte mail) à une liste de destinataires, lentement (pour éviter d'être marqué comme spam / respecter les limites du serveur mail), avec un suivi visuel de la progression et un historique des campagnes passées.

Décisions de conception :

- **Persistance** : SQLite (fichier local), pas de JSON.
- **Temps réel** : WebSocket (Socket.IO), pas de polling.
- **Credentials** : login/mot de passe IMAP/SMTP gardés en mémoire serveur pour la durée de la session web uniquement — jamais écrits sur disque. Redémarrage du serveur ou expiration de session = re-login obligatoire.
- **Multi-utilisateur simplifié** : plusieurs comptes mail peuvent se connecter ; chaque campagne est associée à l'email de l'expéditeur ; l'historique n'affiche que les campagnes de l'email actuellement connecté. Le serveur IMAP/SMTP (host/port/TLS) est une config globale unique côté serveur.
- **Vitesse d'envoi** : `config.sendRate.emailsPerMinute` reste la valeur par défaut proposée, mais chaque campagne peut la surcharger au lancement et l'ajuster pendant l'envoi (`PATCH /campaigns/:id/send-rate`) ; la nouvelle valeur est appliquée au prochain envoi de la boucle en cours (map en mémoire par `campaignId` dans `sendQueue.ts`) et diffusée aux clients abonnés via `campaign:rateChanged`.
- **Stack** : Node.js (backend) + Vue 3 (frontend), TypeScript des deux côtés.
- **Snapshot du brouillon** : le contenu du brouillon (corps + pièces jointes) est stocké en base sous forme de **MIME brut complet** (RFC822), pas éclaté en colonnes `body_html`/`body_text` — plus fidèle (préserve les pièces jointes) et plus simple à ré-envoyer tel quel.
- **Tracking des campagnes** : chaque email envoyé embarque un pixel invisible (comptage des ouvertures) et voit ses liens réécrits vers une redirection de tracking (comptage des clics). Un UUID est assigné à chaque destinataire pour identifier de façon fiable qui a ouvert/cliqué sans confondre deux destinataires ni compter une même ouverture plusieurs fois comme un nouvel événement distinct. Un clic sans ouverture préalable vaut ouverture (`opened_at` est renseigné dès le premier clic). Chaque événement est classé bot/humain via `tracking/botDetector.ts` (User-Agent de scanners de sécurité mail connus, crawlers, clients HTTP génériques, ou absence de User-Agent) ; les événements bot sont journalisés dans `tracking_events` (`is_bot=1`) mais n'incrémentent jamais `opened_at`/`open_count`/`clicked_at`/`click_count`, donc les taux affichés (`% ouverts`, `% cliqués`) les excluent nativement.

## Architecture

Monorepo simple avec deux packages npm : `backend/` (API + orchestration) et `frontend/` (SPA Vue 3 + Vite). Config serveur dans `config/config.json` (gitignored, template `config.example.json`). Données runtime (SQLite) dans `data/`.

### Structure de fichiers

```
mail_sender/
├── package.json                    # scripts racine (concurrently: dev backend+frontend)
├── .gitignore                      # config/config.json, data/*.sqlite, node_modules, dist
├── config/config.example.json
├── data/.gitkeep
├── backend/
│   ├── package.json, tsconfig.json
│   └── src/
│       ├── index.ts                # bootstrap HTTP + Socket.IO + DB init + migrations
│       ├── config.ts                # chargement/validation config.json (zod), fail-fast
│       ├── db/
│       │   ├── connection.ts        # better-sqlite3 init + runner de migrations
│       │   ├── migrations/001_init.sql
│       │   └── repositories/{campaignRepository,recipientRepository}.ts
│       ├── auth/
│       │   ├── session.ts           # express-session (MemoryStore, cookie httpOnly)
│       │   ├── sessionStore.ts      # Map<sessionId, {email, password}> en mémoire process
│       │   ├── authMiddleware.ts    # requireAuth
│       │   └── authRoutes.ts        # POST /login /logout, GET /me
│       ├── mail/
│       │   ├── imapClient.ts        # wrapper imapflow (connect/test, auto-détection Drafts, list, fetch raw MIME, append INBOX)
│       │   ├── draftRoutes.ts       # GET /drafts, GET /drafts/:uid
│       │   ├── smtpClient.ts        # wrapper nodemailer
│       │   └── reportMailer.ts      # construit le rapport MIME + IMAP APPEND dans INBOX
│       ├── recipients/
│       │   ├── csvParser.ts         # csv-parse -> Recipient[]
│       │   ├── vcardParser.ts       # parsing vCard 3.0/4.0 (multi-contact, unfolding de lignes)
│       │   └── recipientValidation.ts
│       ├── campaigns/
│       │   ├── campaignRoutes.ts
│       │   ├── campaignService.ts   # createAndStartCampaign : fetch MIME brut + rewriting + orchestration
│       │   ├── sendQueue.ts         # runCampaign : boucle séquentielle respectant la vitesse configurée
│       │   └── templateRenderer.ts  # personnalisation {{firstName}} avec échappement HTML
│       ├── tracking/
│       │   ├── trackingRoutes.ts    # routes publiques (sans auth) : GET /t/o/:trackingId.png, GET /t/c/:trackingId/:linkId
│       │   ├── linkRewriter.ts      # cheerio : extrait les <a href>, les remplace par des placeholders, peuple campaign_links
│       │   ├── pixelInjector.ts     # insère le placeholder de pixel invisible avant </body> (ou en fin de html)
│       │   └── trackingRepository.ts # enregistrement des open/click events + agrégats par campagne/destinataire
│       ├── uploads/{uploadRoutes,multerConfig}.ts   # multer memoryStorage, limites taille/type
│       ├── sockets/socketServer.ts  # socket.io, auth via session du handshake, rooms par campaignId
│       └── types/index.ts
└── frontend/
    ├── package.json, vite.config.ts, index.html
    └── src/
        ├── main.ts, App.vue
        ├── router/index.ts          # guard d'auth global
        ├── stores/{authStore,campaignStore,draftStore}.ts  # Pinia
        ├── services/{api.ts,socket.ts}
        ├── views/
        │   ├── LoginView.vue
        │   ├── DraftSelectionView.vue
        │   ├── RecipientUploadView.vue
        │   ├── CampaignLaunchView.vue
        │   ├── CampaignHistoryView.vue
        │   └── CampaignDetailView.vue
        └── components/{ProgressBar,DraftListItem,RecipientTable,CampaignStatusBadge}.vue
```

### Librairies

**Backend** : Express (serveur HTTP, cohabite facilement avec Socket.IO) · **imapflow** (client IMAP moderne, Promises, `download()` pour récupérer le MIME brut d'un message) · **mailparser** (parsing du contenu MIME des brouillons, extraction html/text/attachments) · **nodemailer** (SMTP + `MailComposer` pour construire le MIME du rapport) · **csv-parse** (CSV robuste côté Node) · parseur vCard léger fait main (BEGIN/END:VCARD, unfolding de lignes) · **better-sqlite3** (DB, binaires N-API précompilés) · **express-session** avec MemoryStore (le cookie/session peut se perdre au redémarrage, c'est voulu — pas de store persistant) · **zod** (validation config + payloads API) · **multer** memoryStorage (upload sans écriture disque) · **socket.io** · **escape-html** (échappement lors de la personnalisation) · **cheerio** (parsing/réécriture du HTML pour l'injection du pixel et la réécriture des liens) · **uuid** (via `node:crypto` `randomUUID`, génération des `tracking_id` par destinataire).

**Frontend** : Vite + Vue 3 (`<script setup>`) · vue-router 4 (guard d'auth) · Pinia · socket.io-client · fetch natif avec wrapper `credentials:'include'` · Pico.css (CSS classless minimal, suffisant pour un outil interne).

## Modèle de données SQLite

`backend/src/db/migrations/001_init.sql` :

```sql
CREATE TABLE campaigns (
    id                  TEXT PRIMARY KEY,
    sender_email        TEXT NOT NULL,              -- scoping multi-utilisateur
    subject             TEXT NOT NULL,               -- cache pour affichage liste, extrait du MIME au moment du snapshot
    draft_uid           TEXT,
    raw_mime            BLOB NOT NULL,                -- snapshot RFC822 complet du brouillon (corps + pièces jointes)
    status              TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')),
    total_recipients    INTEGER NOT NULL DEFAULT 0,
    sent_count          INTEGER NOT NULL DEFAULT 0,
    failed_count        INTEGER NOT NULL DEFAULT 0,
    send_rate_per_min   INTEGER NOT NULL,
    started_at          TEXT,
    finished_at         TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    error_message       TEXT
);
CREATE INDEX idx_campaigns_sender_email ON campaigns(sender_email);

CREATE TABLE campaign_recipients (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id         TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    tracking_id         TEXT NOT NULL UNIQUE,        -- uuid v4, injecté dans le pixel et les liens de ce destinataire
    email               TEXT NOT NULL,
    first_name          TEXT,
    last_name           TEXT,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    error_reason        TEXT,
    sent_at             TEXT,
    sort_order          INTEGER NOT NULL,
    opened_at           TEXT,                        -- horodatage de la 1ère ouverture (déduplication)
    open_count          INTEGER NOT NULL DEFAULT 0,   -- compteur brut de tous les chargements du pixel
    clicked_at          TEXT,                         -- horodatage du 1er clic, tous liens confondus
    click_count         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);

CREATE TABLE campaign_links (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id         TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    original_url        TEXT NOT NULL                -- URL cible d'origine, avant réécriture
);

CREATE TABLE tracking_events (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_recipient_id   INTEGER NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
    event_type              TEXT NOT NULL CHECK (event_type IN ('open','click')),
    link_id                 INTEGER REFERENCES campaign_links(id),  -- NULL pour un 'open'
    occurred_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    user_agent              TEXT,
    ip_address              TEXT,
    is_bot                  INTEGER NOT NULL DEFAULT 0   -- détecté via botDetector.ts (migration 002) ; exclu des agrégats affichés
);
CREATE INDEX idx_tracking_events_recipient ON tracking_events(campaign_recipient_id);
```

Pas de table `users` : l'authentification est purement IMAP live, `sender_email` est un simple texte de scoping. Le corps du brouillon n'est **pas** éclaté en colonnes (`body_html`/`body_text`) : `raw_mime` conserve le message RFC822 complet tel que récupéré par IMAP (pièces jointes incluses), reparsé à la volée (via `mailparser`) au moment de préparer l'envoi — l'historique reste fidèle même si le brouillon source est modifié/supprimé après coup, et rien n'est perdu (pièces jointes, structure MIME multipart, etc.).

Le tracking distingue volontairement deux niveaux : un résumé rapide par destinataire (`opened_at`/`clicked_at` = premier événement, dédupliqué, pour l'affichage "X% ouverts" sans agrégation ; `open_count`/`click_count` = compteur brut incluant les rechargements répétés du pixel par certains clients mail) et un journal détaillé (`tracking_events`) qui permet de reconstituer l'historique complet et les statistiques par lien (`campaign_links`).

## Config serveur

`config/config.example.json` (à copier en `config.json`, gitignored) :

```json
{
  "server": { "port": 3000, "sessionSecret": "CHANGE_ME", "sessionMaxAgeMs": 28800000 },
  "imap": { "host": "imap.example.com", "port": 993, "secure": true,
            "draftsFolderCandidates": ["Drafts", "INBOX.Drafts", "[Gmail]/Drafts", "Brouillons"] },
  "smtp": { "host": "smtp.example.com", "port": 465, "secure": true },
  "sendRate": { "emailsPerMinute": 10 },
  "uploads": { "maxFileSizeBytes": 5242880, "allowedExtensions": [".csv", ".vcf"] },
  "tracking": { "publicBaseUrl": "https://mailer.example.com" }
}
```

`sendRate.emailsPerMinute` → `delayMs = 60000 / emailsPerMinute` entre deux envois. `tracking.publicBaseUrl` doit être une URL **joignable depuis les clients mail des destinataires** (pas `localhost`) : c'est elle qui préfixe les URLs du pixel et des liens de redirection insérées dans chaque email envoyé.

## API REST (préfixe `/api`) + Socket.IO

| Route | Auth | Rôle |
|---|---|---|
| POST `/auth/login` | non | `{email,password}` → connexion IMAP réelle ; succès → session + credentials en mémoire (Map indexée par `sessionID`, séparée du contenu de session sérialisé) |
| POST `/auth/logout` | oui | détruit session + supprime credentials mémoire |
| GET `/auth/me` | oui | `{email}` courant |
| GET `/drafts` | oui | liste les brouillons (auto-détection du dossier via `draftsFolderCandidates`) |
| GET `/drafts/:uid` | oui | contenu complet (subject, html, text, attachmentCount) |
| POST `/uploads/recipients` | oui | multipart CSV/VCF → parse + valide/déduplique → preview `{recipients, count, warnings}`, rien persisté |
| POST `/campaigns` | oui | `{draftUid, recipients, sendRatePerMinute?}` → le backend **re-télécharge lui-même le MIME brut du brouillon via IMAP** (jamais reconstruit côté front, pour ne jamais faire transiter les pièces jointes par le navigateur), crée la campagne (status `pending`, `sendRatePerMinute` sinon `config.sendRate.emailsPerMinute`) + lance l'envoi en tâche de fond, retourne `{campaignId}` immédiatement |
| GET `/campaigns/defaults` | oui | `{emailsPerMinute}` — vitesse par défaut issue de la config serveur, pour pré-remplir le formulaire de lancement |
| PATCH `/campaigns/:id/send-rate` | oui | `{emailsPerMinute}` → ajuste la vitesse d'une campagne `pending`/`running` en cours d'envoi (404/409 sinon), persiste `send_rate_per_min` et diffuse `campaign:rateChanged` aux abonnés |
| GET `/campaigns` | oui | liste filtrée par `sender_email = session.email`, avec compteurs d'ouverture/clic agrégés (déjà filtrés bot, cf. tracking) |
| GET `/campaigns/:id` | oui | détail + destinataires (avec `opened_at`, `clicked_at`) + breakdown par lien (`campaign_links` + comptage `tracking_events`, bot exclus) ; 403 si `sender_email` ne correspond pas à la session |
| GET `/t/o/:trackingId.png` | **non (public)** | pixel de tracking : enregistre un `tracking_event` de type `open` (`is_bot` déterminé via `botDetector.ts` ; si humain, met à jour `opened_at` si absent + incrémente `open_count`), répond toujours par un GIF/PNG 1×1 transparent, même si `trackingId` inconnu |
| GET `/t/c/:trackingId/:linkId` | **non (public)** | tracking de clic : enregistre un `tracking_event` de type `click` (`is_bot` déterminé via `botDetector.ts` ; si humain, met à jour `clicked_at` **et** `opened_at` si absents + incrémente `click_count`), puis redirige (302) vers `campaign_links.original_url` |

Socket.IO : client → serveur `campaign:subscribe {campaignId}` (rejoint la room après vérif d'appartenance) ; serveur → client `campaign:progress {campaignId, sentCount, failedCount, totalRecipients, currentRecipientEmail}`, `campaign:completed {...,durationMs}`, `campaign:rateChanged {campaignId, emailsPerMinute}`, `campaign:error {campaignId, message}`.

## Flux d'envoi, tracking et rapport

- À la création de la campagne : récupération du MIME brut du brouillon via `imapflow` (`raw_mime`, stocké tel quel en base), puis parsing unique via `mailparser` → `{html, text, attachments}`.
- Si `html` est présent : `linkRewriter.ts` (cheerio) extrait tous les `<a href="...">`, insère une ligne par URL unique dans `campaign_links`, et remplace chaque `href` par un placeholder (`__TRACK_LINK_{linkId}__`) dans un "template" html commun à tous les destinataires. `pixelInjector.ts` ajoute un `<img>` invisible avec un placeholder (`__TRACK_PIXEL__`) juste avant `</body>` (ou en fin de document si absent). *(Le tracking ne s'applique qu'au corps HTML — un brouillon texte seul n'a pas de pixel/liens réécrits.)*
- Une file séquentielle en mémoire par campagne (récursion via boucle async + `setTimeout`, pas `setInterval`, pour attendre la fin réelle de chaque envoi avant de programmer le suivant). Un seul `transporter` nodemailer créé par campagne, réutilisé pour tous les destinataires, avec les mêmes `attachments` (extraites une fois du MIME brut) pour chaque envoi.
- Pour chaque destinataire : le html "template" est personnalisé (`{{firstName}}`/`{{lastName}}` avec échappement `escape-html`) puis les placeholders de tracking sont remplacés par les URLs finales utilisant le `tracking_id` unique du destinataire : `${publicBaseUrl}/t/o/${trackingId}.png` et `${publicBaseUrl}/t/c/${trackingId}/${linkId}`.
- Chaque envoi est dans un `try/catch` individuel : un échec (adresse invalide, mailbox full…) est journalisé (`status='failed'`, `error_reason`) sans jamais interrompre la campagne. Émission `campaign:progress` après chaque tentative.
- **Rapport final : IMAP APPEND direct dans l'INBOX** (pas un SMTP vers soi-même) — construit via `nodemailer.MailComposer.compile()` puis `imapflow.append(mailbox, buffer)`. Contient les statistiques d'envoi et un résumé des ouvertures/clics (taux d'ouverture, taux de clic, liens les plus cliqués). Garantit une apparition immédiate dans l'INBOX, indépendante du routage/anti-spam SMTP.
- **Arrêt manuel** : `POST /campaigns/:id/stop` positionne un flag en mémoire (`stopRequests`, dans `sendQueue.ts`) consulté avant chaque envoi et pendant l'attente entre deux envois (attente interrompable, vérifiée toutes les 250 ms plutôt qu'un simple `setTimeout` bloquant jusqu'au bout). La campagne passe alors en statut `cancelled` ; les destinataires déjà traités gardent leur statut (`sent`/`failed`), les autres restent `pending`. Le rapport final est tout de même envoyé, avec les statistiques partielles.
- **Reprise après coupure (crash/redémarrage)** : les identifiants IMAP/SMTP et la file d'envoi ne vivent qu'en mémoire process (cf. Sécurité) — un redémarrage laisse donc toute campagne `pending`/`running` bloquée en base sans boucle d'envoi active. Au prochain `POST /auth/login` réussi pour cet expéditeur, `resumeInterruptedCampaigns` relance automatiquement (fire-and-forget, ne bloque pas la réponse de login) l'envoi de ces campagnes, en ne traitant que les destinataires encore `pending`. Pour éviter de refaire la réécriture des liens de tracking (qui créerait des doublons dans `campaign_links`), le corps HTML/texte déjà transformé (pixel + liens réécrits) est persisté dans `campaigns.rendered_html`/`rendered_text` à la création de la campagne et simplement relu à la reprise ; seules les pièces jointes sont re-extraites du `raw_mime` (opération déterministe, sans effet de bord).

## Sécurité

Cookie session `httpOnly`, `sameSite:'lax'`, `secure` en prod ; mot de passe jamais sur disque (Map mémoire nettoyée au logout/destroy de session) ; upload en `memoryStorage` avec limite de taille + vérification du contenu (pas juste l'extension) ; validation stricte des emails avec rejet silencieux + warning des lignes invalides ; toute requête `/campaigns*` filtrée par `sender_email` de la session (jamais par ID seul). Les routes de tracking (`/t/o/*`, `/t/c/*`) sont nécessairement publiques (appelées par le client mail du destinataire, sans cookie ni session) : leur seule protection est l'imprévisibilité du `tracking_id` (UUID v4, non énumérable) ; elles ne doivent jamais renvoyer d'information distinctive (même code 200 + image générique que le `trackingId` existe ou non) pour ne pas devenir un oracle permettant de deviner des UUID valides.

Deux vulnérabilités identifiées via `npm audit` ont été corrigées avant mise en service : `nodemailer` (plusieurs CVE, dont injection SMTP/CRLF — critique pour une application qui envoie des emails), mis à jour vers `^10.0.10` ; et `csv-parse` (pollution de prototype via l'option `columns` utilisée par `csvParser.ts`), mis à jour vers `^7.0.2`. `multer` a également été mis à jour vers `^2.0.0` pour les mêmes raisons.

## Vérification end-to-end

1. Copier `config.example.json` → `config.json` avec un compte de test (Ethereal Email via `nodemailer.createTestAccount()` recommandé pour tester sans envoi réel, sinon un vrai compte IMAP/SMTP).
2. `npm run dev` (backend :3000, frontend Vite proxy `/api` + `/socket.io`) ; login, vérifier cookie httpOnly posé et `GET /api/auth/me`.
3. Créer un brouillon de test dans Drafts, vérifier son apparition et l'affichage du contenu.
4. Uploader un CSV (`email,firstName,lastName`) puis un `.vcf` multi-contacts (export Contacts.app) ; vérifier la preview parsée des deux.
5. Configurer `emailsPerMinute` bas (ex. 6) pour observer la vitesse, lancer une campagne sur 3-5 adresses de test dont une invalide volontaire.
6. Vérifier la barre de progression en temps réel (sans polling, via WS), le statut `failed` de l'adresse invalide sans interruption des autres, puis à la fin la présence immédiate du rapport dans l'INBOX (via IMAP APPEND) avec les bonnes statistiques.
7. Préparer un brouillon de test avec un lien et une pièce jointe ; lancer une campagne dessus, ouvrir l'email reçu (image activée) : vérifier en base que `opened_at`/`open_count` de ce destinataire sont mis à jour et que la pièce jointe est bien présente dans le mail reçu. Recharger l'image plusieurs fois : `opened_at` ne doit pas changer mais `open_count` doit s'incrémenter.
8. Cliquer sur le lien tracké dans l'email reçu : vérifier la redirection effective vers l'URL d'origine, et en base la mise à jour de `clicked_at`/`click_count` ainsi qu'un nouvel enregistrement dans `tracking_events` référençant le bon `campaign_links.id`.
9. Redémarrer le process backend, se reconnecter, vérifier que la campagne terminée reste dans `/campaigns` avec ses stats d'envoi ET de tracking exactes (lues depuis SQLite) — et que le redémarrage n'échoue pas sur la migration `is_bot` déjà appliquée.
10. Se connecter avec un second compte de test, vérifier que son historique ne montre pas les campagnes du premier compte.
11. Sur la page de lancement, vérifier que le champ vitesse est pré-rempli depuis `GET /campaigns/defaults` et que la valeur saisie est bien celle utilisée par la campagne (`send_rate_per_min` en base). Pendant l'envoi, changer la vitesse depuis la page détail et vérifier que le délai entre deux envois suivants change en conséquence, et que `campaign:rateChanged` met à jour l'affichage sur un second onglet abonné à la même campagne.
12. Cliquer sur le lien tracké **sans avoir chargé le pixel au préalable** (ex. client mail qui bloque les images mais autorise le clic) : vérifier que `clicked_at` **et** `opened_at` sont tous les deux renseignés après le clic.
13. Simuler une requête vers `/t/o/:trackingId.png` ou `/t/c/:trackingId/:linkId` avec un User-Agent de scanner connu (ex. `Mimecast`, ou aucun header User-Agent) : vérifier que l'événement est journalisé dans `tracking_events` avec `is_bot=1`, mais que `opened_at`/`open_count`/`clicked_at`/`click_count` du destinataire ainsi que les `%` affichés dans l'UI n'en tiennent pas compte.
14. Lancer une campagne sur plusieurs adresses avec une vitesse basse, cliquer sur « Arrêter la campagne » en cours d'envoi : vérifier que le statut passe rapidement à `cancelled` (pas d'attente du délai complet), que les destinataires non encore traités restent `pending`, et que le rapport final arrive quand même dans l'INBOX avec les stats partielles.
15. Lancer une campagne sur plusieurs adresses (vitesse basse), tuer le process backend (`Ctrl+C`/`kill`) après un ou deux envois puis le relancer et se reconnecter avec le même compte : vérifier que l'envoi reprend automatiquement pour les destinataires restés `pending` (sans renvoyer ceux déjà `sent`), que la barre de progression réapparaît, et qu'aucun doublon n'apparaît dans `campaign_links` pour cette campagne.
