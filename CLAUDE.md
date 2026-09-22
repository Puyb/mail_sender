# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal tool to send an email campaign — the body/attachments come from an existing IMAP **draft** — to a list of recipients, throttled to avoid spam flags, with live progress (WebSocket) and open/click tracking. Full design rationale and end-to-end verification checklist live in `docs/SPECIFICATION.md` (French) — read it before making architectural changes; the sections below summarize what's needed for day-to-day work.

## Commands

Monorepo with npm workspaces (`backend/`, `frontend/`), run from the repo root:

```bash
npm run dev      # concurrently runs backend (tsx watch, :3000) + frontend (vite, proxies /api and /socket.io to :3000)
npm run build     # tsc build of backend, then vite build of frontend
npm start          # node backend/dist/index.js (run build first)
```

Per-workspace:

```bash
npm run typecheck -w backend    # tsc --noEmit
npm run build -w backend         # tsc + copies migrations/*.sql into dist/
npm run build -w frontend        # vue-tsc -b && vite build
```

There is no test suite (`npm test` does not exist) and no linter configured — verify changes with `typecheck` and, for behavior, by exercising the app per the "Vérification end-to-end" checklist in `docs/SPECIFICATION.md`.

### Local setup

Copy `config/config.example.json` → `config/config.json` (gitignored) — or use the `.env`-style vars in `.env.example` — with a real/test IMAP+SMTP account (Ethereal Email is suggested for testing without sending real mail). SQLite file lives under `data/` (gitignored).

### Docker

`Dockerfile` is a two-stage build (compiles native deps for `better-sqlite3`, then a slim runtime image running `backend/dist/index.js` and serving the built frontend). `docker-compose.yml` configures everything via env vars and mounts `./data` for the SQLite volume.

## Architecture

Two independent stacks talking over `/api` (REST) and `/socket.io` (WebSocket), proxied together by Vite in dev.

**Backend** (`backend/src/`, TypeScript/CommonJS, Express + Socket.IO + better-sqlite3):
- `config.ts` — loads/validates `config.json` with zod, fails fast.
- `auth/` — login is a **live IMAP connection test**, not a users table. `sessionStore.ts` holds a `Map<sessionId, {email,password}>` in process memory, separate from the serialized express-session — credentials are never written to disk and are lost on restart/logout (by design).
- `db/` — better-sqlite3 connection + migration runner (`migrations/001_init.sql`), repositories per aggregate (`campaignRepository`, `recipientRepository`).
- `mail/` — `imapClient.ts` (imapflow: connect/test, auto-detect Drafts folder from `draftsFolderCandidates`, fetch raw MIME, IMAP `APPEND`), `smtpClient.ts` (nodemailer transporter), `reportMailer.ts` (builds the final report as MIME via `MailComposer` and APPENDs it straight into INBOX — not sent via SMTP).
- `recipients/` — CSV (`csv-parse`) and vCard (hand-rolled, 3.0/4.0, multi-contact, line-unfolding) parsers, plus validation/dedup. Uploads are parsed in-memory only and returned as a preview; nothing is persisted until a campaign is created.
- `campaigns/` — `campaignService.ts` re-fetches the draft's raw MIME **itself** via IMAP when a campaign is created (never trusts a client-submitted body, so attachments never transit through the browser), snapshots it as `raw_mime` BLOB, and kicks off `sendQueue.ts`: a sequential in-memory queue per campaign using recursive `setTimeout` (not `setInterval`) so each send fully completes before the next is scheduled, at `delayMs = 60000 / sendRate.emailsPerMinute`. One nodemailer transporter is reused for the whole campaign. `templateRenderer.ts` does `{{firstName}}`/`{{lastName}}` substitution with `escape-html`.
- `tracking/` — `linkRewriter.ts` (cheerio) extracts every `<a href>` in the draft's HTML into `campaign_links` and swaps hrefs for placeholders in a shared per-campaign template; `pixelInjector.ts` inserts a placeholder tracking pixel before `</body>`. Per-recipient, placeholders are resolved to `${publicBaseUrl}/t/o/{trackingId}.png` and `.../t/c/{trackingId}/{linkId}` using that recipient's UUID `tracking_id`. Tracking only applies to HTML bodies. The `/t/o/*` and `/t/c/*` routes are intentionally public (no session) and must always respond identically (200 + generic pixel / redirect) whether or not the `trackingId` exists — never turn them into an oracle for enumerating valid UUIDs.
- `sockets/socketServer.ts` — Socket.IO authenticated via the HTTP session at handshake; clients join a room per `campaignId` via `campaign:subscribe`; server emits `campaign:progress` / `campaign:completed` / `campaign:error`.
- Every `/campaigns*` read/write is scoped by `sender_email` from the session, never by id alone (multi-account: each connected mailbox only sees its own campaign history).

**Data model** (SQLite, `backend/src/db/migrations/001_init.sql`): `campaigns` (one row per send, `raw_mime` BLOB snapshot of the draft, aggregate counts), `campaign_recipients` (per-recipient status + `tracking_id` UUID + deduplicated `opened_at`/`clicked_at` alongside raw `open_count`/`click_count`), `campaign_links` (original URLs extracted from the draft), `tracking_events` (append-only open/click log referencing a recipient and optionally a link). No `users` table — auth is purely IMAP-live. Draft content is stored as raw RFC822 MIME rather than split `body_html`/`body_text` columns, so history stays faithful (attachments included) even if the source draft is later edited/deleted.

**Frontend** (`frontend/src/`, Vue 3 `<script setup>` + Vite): `router/index.ts` has a global auth guard; `stores/` are Pinia (`authStore`, `campaignStore`, `draftStore`); `services/api.ts` wraps `fetch` with `credentials:'include'`, `services/socket.ts` wraps socket.io-client. View flow: Login → DraftSelection → RecipientUpload → CampaignLaunch → CampaignHistory/CampaignDetail (live progress via `ProgressBar.vue` + socket events).

## Key invariants to preserve

- Passwords/credentials never touch disk or the SQLite DB.
- The backend, not the browser, is the only thing that ever reads a draft's raw MIME from IMAP — a campaign-create request carries only `{draftUid, recipients}`.
- Any individual recipient send failure is caught and recorded (`status='failed'`, `error_reason`) without aborting the rest of the campaign.
- Tracking routes (`/t/o/*`, `/t/c/*`) stay unauthenticated and return uniform responses regardless of whether the `trackingId` is valid.
