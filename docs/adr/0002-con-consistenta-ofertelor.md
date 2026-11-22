# ADR-0002 — Consistența ofertelor concurente (CON)

- **Stare:** Propus (M1) — se confirmă după experimentele CON-1..CON-6 din M2
- **Pachet:** CON
- **Data:** 2026-11-22

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

Combinație în straturi: **validare înainte de tranzacție → tranzacție `IMMEDIATE` → `UPDATE` condiționat → indexuri unice
parțiale `(auctionId, amount)` și `(auctionId, seq)` pentru ofertele acceptate → emitere eveniment după commit.**
Ofertele respinse se inserează în aceeași tranzacție, cu motiv, fără a modifica licitația. Nu se reîncearcă automat:
o ofertă care a pierdut cursa la același preț nu mai este validă.

Motive: corectitudine garantată de baza de date (nu de procesul Node), comportament determinist, cod apropiat de cel din
seminarul 7, portabilitate a `UPDATE`-ului condiționat către alte SGBD-uri.

## Experiment / test (planificat)

- CON-1/CON-2: 20 oferte simultane la același preț, repetat de 30 de ori → 1×`201`, 19×`409`; DB: exact 1 `ACCEPTED`.
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
