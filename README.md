# mail_sender

Outil interne pour envoyer une campagne email — le contenu (corps + pièces jointes) provient d'un **brouillon IMAP existant** — à une liste de destinataires, à vitesse contrôlée (pour éviter d'être marqué comme spam), avec suivi de progression en temps réel et tracking des ouvertures/clics.

Pour le détail des décisions de conception et de l'architecture, voir [`docs/SPECIFICATION.md`](docs/SPECIFICATION.md).

## Fonctionnalités

- Connexion IMAP/SMTP en session (identifiants gardés en mémoire serveur uniquement, jamais écrits sur disque).
- Sélection d'un brouillon existant comme contenu de la campagne (texte, HTML, pièces jointes).
- Import des destinataires depuis un CSV (`email,firstName,lastName`) ou un export vCard (`.vcf`).
- Personnalisation `{{firstName}}` / `{{lastName}}` dans le corps de l'email.
- Envoi séquentiel à vitesse configurable (emails/minute), avec suivi de progression en direct via WebSocket.
- Tracking des ouvertures (pixel invisible) et des clics (réécriture des liens), par destinataire.
- Historique des campagnes envoyées, filtré par compte connecté.
- Rapport de fin de campagne déposé directement dans l'INBOX (via IMAP APPEND).

## Stack technique

- **Backend** : Node.js, TypeScript, Express, Socket.IO, SQLite (`better-sqlite3`), imapflow, nodemailer.
- **Frontend** : Vue 3 (`<script setup>`), Vite, Pinia, vue-router, socket.io-client.
- Monorepo npm workspaces (`backend/`, `frontend/`).

## Prérequis

- Node.js 22+
- Un compte IMAP/SMTP de test (ex. [Ethereal Email](https://ethereal.email/)) ou un vrai compte mail pour les tests d'intégration.

## Démarrage rapide (développement local)

```bash
npm install
cp config/config.example.json config/config.json
# éditer config/config.json : host/port IMAP+SMTP, sessionSecret, etc.

npm run dev
```

`npm run dev` lance en parallèle le backend (`tsx watch`, port 3000) et le frontend (Vite, proxy `/api` et `/socket.io` vers le backend). Ouvrir `http://localhost:5173`, se connecter avec les identifiants du compte mail configuré.

La configuration peut aussi être passée par variables d'environnement (voir [`.env.example`](.env.example)) plutôt que par `config/config.json`.

## Build & production

```bash
npm run build   # build backend (tsc) puis frontend (vite build)
npm start        # sert l'app buildée depuis backend/dist/index.js
```

## Docker

```bash
cp .env.example .env
# éditer .env (SESSION_SECRET, IMAP_*, SMTP_*, TRACKING_PUBLIC_BASE_URL, ...)
docker compose up -d --build
```

La base SQLite est persistée dans `./data` (monté en volume). `TRACKING_PUBLIC_BASE_URL` doit être une URL joignable depuis les clients mail des destinataires (pas `localhost`).

## Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | backend + frontend en mode développement |
| `npm run build` | build de production des deux packages |
| `npm start` | démarre le backend buildé (sert aussi le frontend) |
| `npm run typecheck -w backend` | vérification TypeScript du backend sans compiler |

Il n'y a pas de suite de tests automatisés ; la vérification se fait via `typecheck` et le parcours manuel décrit dans la section « Vérification end-to-end » de [`docs/SPECIFICATION.md`](docs/SPECIFICATION.md).

## Sécurité

- Les identifiants IMAP/SMTP ne sont jamais écrits sur disque : ils vivent en mémoire process pour la durée de la session web, et sont effacés à la déconnexion ou au redémarrage du serveur.
- Les routes de tracking (`/t/o/*`, `/t/c/*`) sont volontairement publiques (appelées par le client mail du destinataire) ; leur seule protection est l'imprévisibilité de l'UUID de tracking.

Voir la section « Sécurité » de [`docs/SPECIFICATION.md`](docs/SPECIFICATION.md) pour le détail.
