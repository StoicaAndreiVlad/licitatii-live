# Licitații în timp real

Aplicație web full-stack pentru **licitații fictive** cu oferte concurente, termen-limită decis de server și
actualizări live — proiect la disciplina **Tehnologii Web**.

- **Echipa:** mafia team — Stoica Andrei-Vlad, Stoian Erik, Stilpeanu Tudor
- **Pachete arhitecturale obligatorii:** **RTM** (colaborare în timp real) + **CON** (concurență și consistență)
- **Etapa curentă:** M1 — Analiză și design (schelet executabil)

## Tehnologii

Node.js LTS · Express 5 · Sequelize 6 + SQLite · Socket.IO (M2) · React + Vite · `node:test` + `supertest` + `c8` ·
Playwright (M3) · Artillery (M3). Doar JavaScript cu module ECMAScript.

## Cerințe preliminare

- [Node.js LTS](https://nodejs.org/) ≥ 22.12 (testat cu Node 26)
- [Git](https://git-scm.com/)

## Instalare și rulare (dezvoltare)

```bash
npm install                 # instalează server + client (workspaces, un singur package-lock.json)
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm run seed                # creează server/data/licitatii.sqlite cu date sintetice + verifică invariantele
npm run dev:server          # API pe http://localhost:3000   (terminal 1)
npm run dev:client          # SPA pe http://localhost:5173    (terminal 2)
```

> npm ≥ 11 rulează scripturile de instalare doar pentru pachetele aprobate; `sqlite3` și `esbuild` sunt deja aprobate
> în `package.json` (`allowScripts`). Dacă apare eroarea „Could not locate the bindings file” pentru `sqlite3`, rulați
> `npm install-scripts approve sqlite3 esbuild`.

### Conturi sintetice (create de seed)

| Rol | E-mail | Parolă |
|---|---|---|
| Organizator | `organizator@licitatii.test` | valoarea `SEED_ADMIN_PASSWORD` din `.env` |
| Licitatori | `licitator01@licitatii.test` … `licitator50@licitatii.test` | valoarea `SEED_BIDDER_PASSWORD` din `.env` |

## Scripturi

| Comandă | Efect |
|---|---|
| `npm test` | toate testele backend (`node --test`) |
| `npm run coverage` | teste + raport coverage statement/branch în `server/coverage/` (text, HTML, JSON) |
| `npm run seed` | recreează baza de date cu seed determinist și verifică invariantele I1–I7 |
| `npm run build` | construiește SPA-ul în `client/dist` |
| `npm start` | pornește serverul; cu `NODE_ENV=production` servește și SPA-ul construit (aceeași origine) |
| `npm run load:l1` / `l2` / `l3` | test de încărcare — **M3** |
| `npm run test:e2e` | Playwright — **M3** |

Mod producție local:

```bash
npm run build
NODE_ENV=production npm start      # PowerShell: $env:NODE_ENV="production"; npm start
```

## Structura

```
server/   API Express, modele Sequelize, seed, teste
client/   SPA React + Vite
docs/     documentația proiectului
```

## Documentație

| Document | Conținut |
|---|---|
| [docs/requirements.md](docs/requirements.md) | actori, roluri și permisiuni, cazuri de utilizare, fluxuri cu criterii de acceptare, reguli, invariante, mașina de stări |
| [docs/architecture.md](docs/architecture.md) | arhitectură, schema de date și constrângeri, contractul API, protocolul live, securitate, integrare externă |
| [docs/packages/rtm-timp-real.md](docs/packages/rtm-timp-real.md) · [docs/packages/con-concurenta.md](docs/packages/con-concurenta.md) | pachetele arhitecturale: interpretare, alternative, verificări planificate |
| [docs/adr/](docs/adr/) | decizii arhitecturale (ADR-0001 RTM, ADR-0002 CON) |
| [docs/testing.md](docs/testing.md) | plan de testare, coverage, trasabilitate |
| [docs/capacity.md](docs/capacity.md) | profil de sarcină, obiective, niveluri de încărcare |
| [docs/ai-usage.md](docs/ai-usage.md) | instrumente AI, reguli de lucru, cazuri tehnice per student |

## Stare M1

| Cerință M1 | Unde |
|---|---|
| Repozitoriu și echipă | acest README |
| Cerințe, roluri, cazuri de utilizare, fluxuri | [requirements.md §2–4](docs/requirements.md) |
| Reguli și invariante | [requirements.md §5–6](docs/requirements.md#5-reguli-de-business) |
| Flux cu stări și tranziții | [requirements.md §7](docs/requirements.md#7-mașina-de-stări-a-licitației) |
| Schemă de date | [architecture.md §4](docs/architecture.md#4-modelul-de-date) + `server/src/models/index.js` |
| API | [architecture.md §5–6](docs/architecture.md#5-contractul-api-rest) |
| Schiță de arhitectură | [architecture.md §1](docs/architecture.md#1-vedere-de-ansamblu) |
| Alternative pentru cele două pachete | [packages/](docs/packages/), [adr/](docs/adr/) |
| Model / profil de sarcină | [capacity.md](docs/capacity.md) |
| Plan de teste | [testing.md](docs/testing.md) |
| Schelet executabil | `npm install && npm run seed && npm test && npm run dev:server` — 139 teste backend (API, constrângeri DB, seed, invariante, reguli de ofertare, mașina de stări) + 4 teste client (`npm test -w client`) |

## Echipa și împărțirea muncii (propunere)

Sarcinile detaliate, cu fișiere și commit-uri, sunt în [PLAN-ECHIPA.md](PLAN-ECHIPA.md).

| Membru | Responsabilitate principală | Teste proprii |
|---|---|---|
| Stoica Andrei-Vlad | autentificare și roluri, obiecte, mașina de stări + planificator, filtrare/ordonare/paginare, securitate de bază | permisiuni, validare, tranziții, listări |
| Stoian Erik | **CON**: serviciul tranzacțional de ofertare, invariante, `verify-invariants`, test de încărcare și capacitate | CON-1..6, unitare pentru reguli |
| Stilpeanu Tudor | **RTM**: gateway Socket.IO, reconcilierea după `seq` în client, paginile React, integrarea cu cursul valutar, E2E | RTM-1..7, reducer, E2E |

Fiecare membru își scrie testele, documentează un caz tehnic AI în [docs/ai-usage.md](docs/ai-usage.md) și își poate
explica fluxurile.

### Reguli Git

- `main` este mereu executabil; lucrul se face pe ramuri `feat/...`, `fix/...`, `docs/...` și intră prin pull request revizuit de un coleg.
- Commit-uri mici, cu mesaje clare („feat(bids): tranzacție IMMEDIATE pentru plasarea ofertei”).
- `.env` și bazele de date nu se adaugă niciodată în Git (vezi `.gitignore`).
