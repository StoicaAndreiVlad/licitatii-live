# ADR-0002 — Consistența ofertelor concurente (CON)

- **Stare:** Propus (M1) — se confirmă după experimentele CON-1..CON-6 din M2
- **Pachet:** CON
- **Data:** 2026-11-22
- **Revizuit:** Stoian Erik, 2026-11-22 — precizări la ordinea regulilor, ceasul ofertei și limitele indexului unic

## Problemă

Mai mulți licitatori trimit simultan oferte pentru aceeași licitație, inclusiv la același preț. Fără control, două oferte
pot fi acceptate la aceeași sumă, liderul poate fi suprascris de o ofertă respinsă, iar rezultatul final devine
nedeterminist (încălcarea I1, I3–I6). Integritatea trebuie protejată pe server și în baza de date (SQLite).

## Alternative

1. Fără control (citește-verifică-scrie) — doar ca dovadă a problemei
2. Tranzacție SQLite `BEGIN IMMEDIATE`
3. `UPDATE` condiționat (compare-and-set pe `version`, `status`, `endsAt`)
4. Blocare optimistă cu reîncercări
5. Mutex / coadă în memorie per licitație
6. Doar constrângeri unice în DB

Comparația detaliată: [packages/con-concurenta.md](../packages/con-concurenta.md).

## Decizie

Combinație în straturi: **autorizare și validare înainte de tranzacție → tranzacție `IMMEDIATE` → evaluare cu funcția
pură `evaluateBid` → `UPDATE` condiționat → indexuri unice parțiale `(auctionId, amount)` și `(auctionId, seq)` pentru
ofertele acceptate → emitere eveniment după commit.**

- Regulile R1–R6 sunt într-o singură funcție pură, `evaluateBid(auction, { bidderId, amount, role }, now)`
  (`server/src/domain/bid-rules.js`), testată izolat (U-BID-1..7, U-VAL-1). Serviciul o apelează **în** tranzacție, pe
  licitația citită în aceeași tranzacție, cu `now = clock.now()` citit după obținerea lock-ului.
- Ofertele respinse cu `409` se inserează în aceeași tranzacție, cu `rejectReason` = codul, fără a modifica licitația
  (R12, I3). Cererile `400`/`403` nu intră în tranzacție și nu apar în istoric.
- `Bid.createdAt` = același `now` folosit la evaluare, ca I2 să fie verificabilă cu ceasul injectat.
- Nu se reîncearcă automat: o ofertă care a pierdut cursa la același preț nu mai este validă.
- `UniqueConstraintError` (ultima barieră) se mapează pe `409 BID_TOO_LOW`; în acest caz rar tranzacția este anulată,
  deci oferta nu apare în istoric.

Motive: corectitudine garantată de baza de date (nu de procesul Node), comportament determinist, cod apropiat de cel din
seminarul 7, portabilitate a `UPDATE`-ului condiționat către alte SGBD-uri.

## Experiment / test (planificat)

- U-BID-1..7, U-VAL-1: regulile pure, inclusiv limita exactă `now = endsAt` (respinsă) și ordinea codurilor — **implementat în M1**.
- CON-1/CON-2: 20 oferte simultane la același preț, repetat de 30 de ori → 1×`201`, 19×`409`, zero `5xx`; DB: exact 1 `ACCEPTED`.
- CON-3: 100 oferte de la 20 licitatori → I1–I5 verificate din DB.
- CON-4: oferte la limita termenului, concurente cu planificatorul → nicio ofertă acceptată după `endsAt`.
- CON-5: aceeași sarcină pe varianta nesigură → defectul este reprodus.
- CON-6: eroare injectată în mijlocul tranzacției → rollback complet.
- Măsurare: latența p95 a `POST bid` la 5 / 20 / 50 licitatori, pentru a cuantifica costul serializării.

## Consecințe și limite

- (+) Integritatea nu depinde de interfață sau de un singur proces.
- (+) Istoricul conține și ofertele respinse (util pentru verificare și demonstrație).
- (−) SQLite serializează toate scrierile: debitul total de oferte este plafonat; se măsoară în [capacity.md](../capacity.md).
- (−) Scrierea ofertelor respinse crește volumul de scrieri sub sarcină; dacă devine blocaj, se poate renunța la persistarea lor (decizie documentată).
- (−) `IMMEDIATE` este specific SQLite; pe PostgreSQL s-ar folosi `SELECT … FOR UPDATE` sau doar `UPDATE`-ul condiționat.
- (−) O cerere care așteaptă lock-ul peste `endsAt` este respinsă cu `AUCTION_CLOSED`, deși a ajuns la server înainte de
  termen; regula este „momentul evaluării pe server”, iar CON-4 măsoară cât de des se întâmplă.
- (+) Regulile sunt separate de persistență: aceeași funcție poate fi folosită și de varianta nesigură (CON-5), ca
  diferența dintre variante să fie doar controlul concurenței, nu regulile.
