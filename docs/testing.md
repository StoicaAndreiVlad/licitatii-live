# Plan de testare

> Etapa **M1**: strategie, instrumente, cazuri planificate și trasabilitate. Raportul de coverage și analiza lacunelor
> se adaugă în M2 (inițial) și M3 (final).

## 1. Niveluri și instrumente

| Nivel | Ce acoperă | Instrument | Locație |
|---|---|---|---|
| Unitate | reguli pure: `evaluateBid`, tranziții de stare, desemnarea câștigătorului, validări, reducerul client `applyAuctionEvent` | `node:test` (server), Vitest (client) | `server/tests/unit`, `client/src/**/*.test.jsx` |
| Integrare API + persistență | rute REST reale pe SQLite temporar: autentificare, CRUD, tranziții, oferte, filtrare/paginare, curs valutar cu simulator | `node:test` + `supertest` | `server/tests/integration` |
| Negative | validare (400), neautentificat (401), rol greșit (403), obiect străin / `DRAFT` (404), conflicte (409) | idem | `server/tests/integration/*.negative.test.js` |
| CON | cereri concurente reale + verificarea DB | `node:test` + `Promise.all` cu `supertest` | `server/tests/con` |
| RTM | 20 clienți Socket.IO, reconectare, ordine diferită, autorizare mesaje | `node:test` + `socket.io-client` | `server/tests/rtm` |
| Componente UI | stări de încărcare/eroare/gol, formular de ofertă | Vitest + Testing Library | `client/src` |
| End-to-end | flux complet organizator + 2 licitatori | Playwright | `e2e/` |
| Încărcare | L1/L2/L3 | Artillery + scripturi Node | `load/` (vezi [capacity.md](capacity.md)) |

Principii: fiecare test își creează propria bază SQLite temporară (fișier în `os.tmpdir()`), deci testele sunt
independente; ceasul este injectat (`clock`) pentru teste de termen-limită fără `sleep`; seed-ul este determinist.

## 2. Cazuri planificate

### 2.1 Unitate — reguli de business

| ID | Caz | Așteptat |
|---|---|---|
| U-BID-1 | prima ofertă = `startPrice` | acceptată |
| U-BID-2 | prima ofertă = `startPrice − 1` | `BID_TOO_LOW` |
| U-BID-3 | ofertă = `currentPrice + minIncrement` (limită exactă) | acceptată |
| U-BID-4 | ofertă = `currentPrice + minIncrement − 1` | `BID_TOO_LOW`, `minAmount` corect |
| U-BID-5 | `now = endsAt − 1 ms` / `now = endsAt` / `now > endsAt` | acceptată / `AUCTION_CLOSED` / `AUCTION_CLOSED` |
| U-BID-6 | licitație `SCHEDULED` / `ENDED` / `CANCELLED` | `AUCTION_NOT_ACTIVE` / `AUCTION_CLOSED` / `AUCTION_NOT_ACTIVE` |
| U-BID-7 | liderul licitează din nou | `ALREADY_LEADING` |
| U-STA-1 | tabel complet de tranziții (5 × 5 stări × 2 roluri + sistem) | doar tranzițiile din [requirements.md §7](requirements.md#7-mașina-de-stări-a-licitației) permise |
| U-STA-2 | `ACTIVE → CANCELLED` cu oferte | `AUCTION_HAS_BIDS` |
| U-STA-3 | tranziție către starea curentă | „fără efect” (idempotent) |
| U-WIN-1 | fără oferte | `UNSOLD`, fără câștigător |
| U-WIN-2 | mai multe oferte acceptate | câștigătorul = suma maximă |
| U-RTM-1 | reducer: `seq` 5, 6, 7 în ordine | stare = 7 |
| U-RTM-2 | reducer: 5, 7, 6 | la 7 → gol detectat (`needsResync`), starea nu regresează |
| U-RTM-3 | reducer: duplicat 6, 6 | al doilea ignorat |
| U-RTM-4 | reducer: instantaneu cu `version` mai mic decât `lastSeq` | ignorat |
| U-VAL-1 | `amount`: `"100"`, `10.5`, `-1`, `0`, lipsă, `1e12`, `null` | `VALIDATION_ERROR` |

### 2.2 Integrare și negative — API

| ID | Caz | Așteptat |
|---|---|---|
| I-AUTH-1 | register → login → me | 201 → 200 + cookie `httpOnly` → 200 fără `passwordHash` |
| I-AUTH-2 | login cu parolă greșită / e-mail inexistent | 401 `INVALID_CREDENTIALS` (același mesaj) |
| I-AUTH-3 | register cu e-mail existent | 409 `EMAIL_TAKEN` |
| I-AUTH-4 | register nu poate crea `admin` (câmp `role` în body) | câmp respins (400) sau ignorat — rolul rămâne `bidder` |
| I-AUTH-5 | parola este stocată hash-uit | coloana `passwordHash` ≠ parola, începe cu `$2` |
| I-PERM-1 | licitator → `POST /api/items`, `POST /api/auctions`, `PUT …/status` | 403, DB neschimbată |
| I-PERM-2 | organizator → `POST …/bids` | 403 |
| I-PERM-3 | fără cookie → orice rută protejată | 401 |
| I-PERM-4 | licitator → `GET /api/auctions/:id` pentru `DRAFT`; `GET /api/auctions?status=DRAFT` | 404; listă fără `DRAFT` |
| I-ITEM-1 | CRUD obiect; ștergere obiect cu licitații | 201/200/204; 409 `ITEM_IN_USE` |
| I-AUC-1 | a doua licitație deschisă pentru același obiect | 409 `ITEM_HAS_OPEN_AUCTION` (și direct în DB: `UniqueConstraintError`) |
| I-AUC-2 | `PUT status` repetat | aceeași stare, `version` neschimbat la repetare |
| I-AUC-3 | `PATCH` pe licitație non-`DRAFT` | 409 `AUCTION_NOT_EDITABLE` |
| I-BID-1 | ofertă validă | 201; DB: `ACCEPTED`, `seq`; licitația actualizată |
| I-BID-2 | ofertă respinsă | 409; DB: `REJECTED` cu motiv; licitația neschimbată (I3) |
| I-BID-3 | ofertă după `endsAt` (ceas injectat) | 409 `AUCTION_CLOSED` |
| I-BID-4 | eroare injectată în tranzacție | 500; rollback complet (CON-6) |
| I-LIST-1 | filtrare după `status`, `category`, `q`, `minPrice`/`maxPrice` | doar elementele corespunzătoare |
| I-LIST-2 | ordonare `-currentPrice`, `endsAt` | ordine corectă, stabilă (cheie secundară `id`) |
| I-LIST-3 | paginare peste tot setul | uniunea paginilor = setul complet, fără duplicate; `meta.total` corect |
| I-LIST-4 | `limit=0`, `limit=500`, `sort=passwordHash`, `page=-1` | 400 |
| I-END-1 | planificator închide licitația | `ENDED`, `outcome`, câștigător corect; evenimentul `auction:status` emis |
| I-RATES-1 | simulator OK / timeout / 500 / răspuns invalid | 200 / 200 `stale:true` (cu cache) sau 503 |
| I-SEC-1 | răspunsurile nu conțin `passwordHash` / e-mailul altor utilizatori | verificare pe toate rutele de listare |

### 2.3 Pachete

Cazurile CON-1..CON-6 sunt descrise în [packages/con-concurenta.md](packages/con-concurenta.md#5-verificări-obligatorii-planificate),
iar RTM-1..RTM-7 în [packages/rtm-timp-real.md](packages/rtm-timp-real.md#5-verificări-obligatorii-planificate).

### 2.4 End-to-end (Playwright)

**E2E-1 — „licitație completă”**: organizatorul se autentifică, creează un obiect și o licitație de 20 s, o pornește;
licitatorii A și B (contexte separate) o deschid; A licitează → B vede noul preț fără refresh; B supralicitează → A vede;
A încearcă o sumă prea mică → mesaj de eroare; la expirare ambii văd „Câștigător: B”; B vede licitația în „Câștigate”.

## 3. Coverage

- Instrument: `c8` peste `node --test` (raport `text`, `html`, `json-summary`) — `npm run coverage` în `server/`.
- Praguri de proiect: **≥ 70 % statements**, **≥ 60 % branches** pentru codul backend scris de echipă (activate cu `--check-coverage` din M2).
- **Excluderi (justificate):**
  - `src/seed.js` — generator de date, nu logică de producție;
  - `src/server.js` — bootstrap (ascultare port, semnale); logica testabilă este în `app.js`;
  - `node_modules/`, `client/` (raport separat), fișierele de configurare și eventualele migrări.
- Raportul de lacune (M2/M3) va enumera funcționalitățile insuficient testate și riscul asociat.

## 4. Trasabilitate cerințe → teste

| Cerință / invariantă | Teste |
|---|---|
| F1 (AC1.1–AC1.6) | I-ITEM-1, I-AUC-1..3, I-PERM-1, U-STA-1..3, E2E-1 |
| F2 (AC2.1–AC2.6) | U-BID-1..7, U-VAL-1, I-BID-1..3, I-PERM-2, RTM-1, E2E-1 |
| F3 (AC3.1–AC3.4) | U-WIN-1..2, I-END-1, CON-4, E2E-1 |
| F4 (AC4.1–AC4.3) | U-RTM-1..4, RTM-2, RTM-3 |
| F5 (AC5.1–AC5.4) | I-LIST-1..4, I-PERM-4 |
| I1, I2 | U-BID-*, I-BID-3, CON-1, CON-3, CON-4 |
| I3 | I-BID-2, RTM-7, CON-1 |
| I4, I5 | CON-1, CON-2, CON-3, `verify-invariants` |
| I6 | U-WIN-*, I-END-1, CON-4 |
| I7 | I-AUC-1 |
| Securitate de bază | I-AUTH-*, I-PERM-*, I-SEC-1, RTM-4..6 |

## 5. Rulare

```bash
npm test                 # toate testele (server + client)
npm run test -w server   # doar backend
npm run coverage -w server
```
