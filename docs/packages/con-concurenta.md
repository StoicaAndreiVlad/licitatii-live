# Pachetul CON — Concurență și consistență

> Stare: **M1 – analiză și alternative** (revizuit de Stoian Erik). Implementare și dovezi: M2 (primul scenariu), M3 (validare completă).
> Decizie: [ADR-0002](../adr/0002-con-consistenta-ofertelor.md) · Reguli pure: [`server/src/domain/bid-rules.js`](../../server/src/domain/bid-rules.js)

## 1. Cerința injectată, aplicată temei

| Cerință generală CON | Interpretare în „Licitații în timp real” |
|---|---|
| Operații concurente asupra aceleiași resurse limitate | Mai mulți licitatori trimit simultan oferte pentru **aceeași licitație**. Resursa limitată este **poziția de lider la un anumit nivel de preț**: capacitate = 1 ofertă acceptată per sumă și, la un moment dat, un singur lider. |
| Integritatea protejată de server / baza de date | Invariantele I1–I5 ([requirements.md](../requirements.md#6-invariante-critice-protejate-în-backend--baza-de-date)) sunt impuse prin tranzacție + `UPDATE` condiționat + indexuri unice parțiale, nu doar în interfață. |
| ≥ 20 cereri concurente pentru capacitate insuficientă | 20 de licitatori diferiți trimit **în același moment** o ofertă cu **aceeași sumă** (minimul curent) → capacitate 1, cerere 20. |
| Verificarea răspunsurilor **și** a stării persistente; fără supraalocare | Exact un `201`, exact nouăsprezece `409`; în DB exact o ofertă `ACCEPTED` la acea sumă, 19 `REJECTED`, `currentPrice`, `leaderId`, `version` coerente. |
| Verificarea temei (fișa) | „Oferte simultane la același preț, cu verificarea istoricului DB”. |

## 2. Ce poate merge prost fără protecție

Implementarea naivă „citește → verifică → scrie” (ca `unsafe-book-seats.js` / `unsafeBorrowBook` din seminarul 7):

```
t0  cererea A citește currentPrice = 1000   cererea B citește currentPrice = 1000
t1  A: 1050 ≥ 1000 + 50 ✔                    B: 1050 ≥ 1000 + 50 ✔
t2  A: UPDATE currentPrice = 1050, leader = A
t3                                           B: UPDATE currentPrice = 1050, leader = B   ← suprascrie
t4  două oferte ACCEPTED la 1050; liderul depinde de ordinea scrierilor → rezultat nedeterminist
```

Încalcă I1, I4, I5 și I6. Vom păstra intenționat o variantă nesigură (`unsafe-place-bid.js`) folosită **doar în teste**
pentru a demonstra defectul (ca în seminarul 7).

## 3. Alternative analizate

| # | Alternativă | Cum funcționează | Avantaje | Dezavantaje / limite |
|---|---|---|---|---|
| A | **Fără control** (citește-verifică-scrie) | – | simplu | supraalocare, rezultat nedeterminist — doar pentru demonstrație |
| B | **Tranzacție SQLite `IMMEDIATE`** | `BEGIN IMMEDIATE` ia lock-ul de scriere la începutul tranzacției; citirea, evaluarea și scrierea sunt serializate | corect pe SQLite; cod clar; aceeași limită pentru ofertă + istoric | serializează toate scrierile din DB (nu doar pe licitație); timpul de așteptare crește cu sarcina; specific SQLite |
| C | **`UPDATE` condiționat (compare-and-set)** | `UPDATE Auctions SET … WHERE id=? AND version=? AND status='ACTIVE' AND endsAt>?`; `affectedRows = 0` ⇒ pierdut cursa | atomic la nivel de rând; portabil (PostgreSQL/MySQL); nu necesită lock explicit | la conflict trebuie reevaluat/respins; singur nu acoperă inserarea ofertei fără tranzacție |
| D | **Blocare optimistă cu reîncercare** (`version` + retry) | ca C, dar la conflict se reîncearcă de N ori | debit bun la conflicte rare | la licitații „fierbinți” conflictele sunt dese → reîncercări inutile; o ofertă la același preț oricum nu mai e validă după reîncercare |
| E | **Mutex / coadă în memorie per licitație** | ofertele pentru aceeași licitație trec printr-o coadă în proces | fără lock în DB; ordine explicită | nu protejează baza de date (alt proces, script, al doilea server); se pierde la restart; integritatea nu mai e „în DB” |
| F | **Doar constrângeri DB** (index unic parțial pe `(auctionId, amount)`) | a doua inserare la aceeași sumă eșuează cu `UniqueConstraintError` | garanție finală în DB | nu verifică pasul minim, termenul sau liderul; trebuie combinată |

## 4. Decizie propusă (de validat experimental în M2)

**B + C + F, în straturi** („defense in depth”):

1. Autorizarea (rol `bidder`, R5) și validarea formatului sumei (R6, `validateAmount`) **înainte** de tranzacție — cererile `403`/`400` nu iau lock-ul și nu se scriu în istoric.
2. `sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE })` — limita de consistență cuprinde: citirea licitației, `now = clock.now()`, evaluarea regulilor cu funcția pură `evaluateBid`, actualizarea licitației și inserarea ofertei (acceptată sau respinsă cu `rejectReason` = codul `409`).
3. `UPDATE` condiționat pe `version`, `status` și `endsAt > :now` — protejează și dacă, pe viitor, se renunță la `IMMEDIATE` sau se migrează pe alt SGBD. `affectedRows = 0` ⇒ oferta este reevaluată pe starea recitită și respinsă (fără reîncercare).
4. Indexurile unice parțiale `(auctionId, amount)` și `(auctionId, seq)` pentru `ACCEPTED` — ultima barieră; `UniqueConstraintError` este mapată pe `409 BID_TOO_LOW`, nu pe `500`. Cu `IMMEDIATE` această ramură nu ar trebui să se execute; dacă se execută, tranzacția este anulată, deci oferta **nu** apare în istoric ca `REJECTED` (limită acceptată, documentată).
5. `Bid.createdAt` primește explicit `now` de la ceasul injectat (nu valoarea implicită a Sequelize), altfel I2 și CON-4 nu pot fi verificate cu ceasul de test.
6. Evenimentul live se emite **după** commit, doar pentru oferte acceptate.

Configurare SQLite: `PRAGMA journal_mode=WAL`, `PRAGMA busy_timeout=5000`, `PRAGMA foreign_keys=ON`.
Toate operațiile din tranzacție primesc `{ transaction }` (seminarul 7 a arătat că un apel fără ea blochează până la `SQLITE_BUSY`).
Dacă `busy_timeout` expiră sub sarcină, tranzacția eșuează cu `SQLITE_BUSY` și nu se scrie nimic; CON-1 cere explicit zero erori `5xx`, iar numărul acestor cazuri se raportează în testele de încărcare ([capacity.md](../capacity.md)).

### Ordinea regulilor în `evaluateBid`

Funcția pură `evaluateBid(auction, { bidderId, amount, role }, now)` întoarce `{ ok: true, minNextBid }` sau
`{ ok: false, code, message, details? }` și nu aruncă excepții. Verificările se fac în ordinea de mai jos; prima care
eșuează decide codul, astfel încât același input dă mereu același cod:

| # | Regulă | Cod | HTTP |
|---|---|---|---|
| 1 | R5 — doar rolul `bidder` (orice alt rol, inclusiv lipsă, este refuzat) | `FORBIDDEN` | 403 |
| 2 | R6 — `amount` număr întreg în [1, 1.000.000.000], fără conversie din șir | `VALIDATION_ERROR` | 400 |
| 3 | R3 — starea: `ENDED` → închisă; `DRAFT`/`SCHEDULED`/`CANCELLED` → neactivă | `AUCTION_CLOSED` / `AUCTION_NOT_ACTIVE` | 409 |
| 4 | R3 — `now < endsAt` strict (la `now = endsAt` licitația este închisă; `endsAt` lipsă = închisă) | `AUCTION_CLOSED` | 409 |
| 5 | R4 — autorul nu este liderul curent | `ALREADY_LEADING` | 409 |
| 6 | R1/R2 — `amount ≥ minimumBid(auction)`; `details.minAmount` = minimul curent | `BID_TOO_LOW` | 409 |

Verificarea 4 respinge și o licitație încă `ACTIVE` în DB dar expirată (planificatorul nu a rulat încă) — termenul
nu depinde de planificator. Cazurile sunt acoperite de testele U-BID-1..7 și U-VAL-1 (`server/tests/unit/bid-rules.test.js`).

## 5. Verificări obligatorii planificate

| ID | Scenariu | Dovadă așteptată |
|---|---|---|
| CON-1 | 20 licitatori **diferiți**, niciunul lider, trimit simultan aceeași sumă (= minimul curent) | răspunsuri: 1×`201`, 19×`409 BID_TOO_LOW` (niciun `5xx`); DB: 1 `ACCEPTED`, 19 `REJECTED`; `currentPrice` = suma; `leaderId` = autorul ofertei acceptate; `version` crescut cu 1 |
| CON-2 | Repetat CON-1 de 30 de ori (detectare curse rare) | 30/30 treceri |
| CON-3 | 20 licitatori × 5 oferte cu sume crescătoare aleatoare (seed fix), trimise concurent = 100 oferte | toate ofertele `ACCEPTED` au sume strict crescătoare după `seq`, diferență ≥ `minIncrement`; I5 respectată; numărul `201` = numărul `ACCEPTED` din DB |
| CON-4 | Oferte concurente în ultimele 100 ms (ceas injectat), cu planificatorul închizând licitația | nicio ofertă `ACCEPTED` cu `createdAt ≥ endsAt`; ofertele întârziate sunt `409 AUCTION_CLOSED`; câștigătorul = oferta acceptată cu suma maximă |
| CON-5 | Varianta nesigură (`unsafe`) pe același scenariu | demonstrează ≥ 2 oferte acceptate la aceeași sumă sau lider inconsecvent (dovada problemei) |
| CON-6 | Eroare injectată după `UPDATE` și înainte de `INSERT` | rollback complet: `currentPrice`, `leaderId`, `version` neschimbate; nicio ofertă inserată |

Scriptul `load/verify-invariants.js` (M2) refolosește `checkInvariants` din `server/src/invariants.js` și recalculează I1–I7 din DB după fiecare test de încărcare; orice încălcare oprește scriptul cu cod de ieșire ≠ 0.

## 6. Limite cunoscute (de documentat cu măsurători)

- SQLite are un singur scriitor: debitul de scriere este plafonat global, nu per licitație. Se va măsura în [capacity.md](../capacity.md).
- Soluția presupune un singur proces Node. Pentru mai multe instanțe, partea CON rămâne corectă (DB), dar partea RTM ar necesita un adaptor Socket.IO partajat (ex. Redis) — în afara scopului.
- Precizia termenului este cea a ceasului serverului (milisecunde); întârzierea de rețea nu este compensată — regula este explicit „momentul primirii la server”. Mai exact, contează `now` citit **în** tranzacție, după obținerea lock-ului: o cerere sosită înainte de `endsAt`, dar care a așteptat lock-ul până după `endsAt`, este respinsă. Este comportamentul dorit (decizia e a serverului), dar se documentează la CON-4.
- Ofertele respinse cu `409` sunt scrise în istoric (R12), deci sub sarcină „fierbinte” cresc scrierile; costul se măsoară în [capacity.md](../capacity.md).
