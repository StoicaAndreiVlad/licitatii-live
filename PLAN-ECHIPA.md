# Plan de lucru al echipei — mafia team

> Cine ce face, în ce fișiere și cu ce commit-uri. Fiecare lucrează pe ramura proprie și intră în `main` prin
> Pull Request revizuit de un coleg. Sarcinile sunt alese astfel încât fiecare să modifice alte fișiere decât ceilalți.

## 1. Pregătire (o singură dată, fiecare membru)

```powershell
git clone https://github.com/StoicaAndreiVlad/licitatii-live.git
cd licitatii-live
git config user.name "Nume Prenume"
git config user.email "emailul-contului-de-github"
npm install
Copy-Item .env.example .env
npm run seed
npm test
```

Dacă `git` nu este recunoscut în terminal: instalați [Git](https://git-scm.com/), apoi închideți și redeschideți terminalul.

## 2. Fluxul pentru fiecare sarcină

```powershell
git checkout main
git pull
git checkout -b feat/nume-sarcina      # ex. feat/bid-rules
# ... lucru, teste (npm test) ...
git add <fișierele modificate>
git commit -m "feat(domain): regula de validare a ofertelor"
git push -u origin feat/nume-sarcina
```

Apoi pe GitHub: **Compare & pull request** → reviewer = colegul indicat mai jos → după aprobare, **Merge**.

Revizuiri încrucișate: **Andrei → Erik**, **Erik → Tudor**, **Tudor → Andrei**.

## 3. Sarcini rămase pentru M1

### Stoian Erik — pachetul CON (concurență)

| # | Sarcina | Fișiere | Commit sugerat |
|---|---|---|---|
| 1 | Revizuiește și corectează analiza pachetului CON și ADR-0002 | `docs/packages/con-concurenta.md`, `docs/adr/0002-con-consistenta-ofertelor.md` | `docs(con): revizuire analiză CON și ADR-0002` |
| 2 | Funcția pură `evaluateBid(auction, { bidderId, amount, role }, now)` → `{ ok: true, minNextBid }` sau `{ ok: false, code, details }` (regulile R1–R6 din [requirements.md](docs/requirements.md#5-reguli-de-business)) | `server/src/domain/bid-rules.js` | `feat(domain): regula de validare a ofertelor` |
| 3 | Teste unitare U-BID-1..7 și U-VAL-1 din [testing.md](docs/testing.md#21-unitate--reguli-de-business) | `server/tests/unit/bid-rules.test.js` | `test(domain): teste unitare pentru evaluateBid` |
| 4 | Cazul tehnic AI propriu | `docs/ai-usage.md` (Caz 2) | `docs(ai): caz tehnic Erik` |

### Stilpeanu Tudor — pachetul RTM (timp real)

| # | Sarcina | Fișiere | Commit sugerat |
|---|---|---|---|
| 1 | Revizuiește și corectează analiza pachetului RTM și ADR-0001 | `docs/packages/rtm-timp-real.md`, `docs/adr/0001-rtm-transport-si-reconciliere.md` | `docs(rtm): revizuire analiză RTM și ADR-0001` |
| 2 | Configurează Vitest în client: `npm i -D vitest -w client`, script `"test": "vitest run"` | `client/package.json`, `package-lock.json` | `chore(client): configurare Vitest` |
| 3 | Reducerul `applyAuctionEvent(state, event)`: aplică doar `seq = lastSeq + 1`, ignoră duplicate/vechi, la gol setează `needsResync: true` | `client/src/auction/auction-reducer.js` | `feat(client): reconcilierea stării după seq` |
| 4 | Teste U-RTM-1..4: în ordine, inversate (5, 7, 6), duplicate, instantaneu vechi | `client/src/auction/auction-reducer.test.js` | `test(client): evenimente în ordine diferită și duplicate` |
| 5 | Cazul tehnic AI propriu | `docs/ai-usage.md` (Caz 3) | `docs(ai): caz tehnic Tudor` |

### Stoica Andrei-Vlad — roluri, stări, catalog

| # | Sarcina | Fișiere | Commit sugerat |
|---|---|---|---|
| 1 | Funcția pură `canTransition(from, to, actor, { hasAcceptedBids })` → `{ ok, code? }` ([mașina de stări](docs/requirements.md#7-mașina-de-stări-a-licitației)) | `server/src/domain/auction-states.js` | `feat(domain): mașina de stări a licitației` |
| 2 | Teste U-STA-1..3: tabelul complet de tranziții, anulare cu oferte, tranziție repetată | `server/tests/unit/auction-states.test.js` | `test(domain): tranziții valide și invalide` |
| 3 | Cazul tehnic AI propriu | `docs/ai-usage.md` (Caz 1) | `docs(ai): caz tehnic Andrei` |
| 4 | Trimite titularului întrebările deschise din [requirements.md §9](docs/requirements.md#9-ipoteze-și-întrebări-deschise-pentru-titular) | – | – |

> `docs/ai-usage.md` este modificat de toți trei: completați cazurile la final, după ce celelalte PR-uri au intrat în
> `main`, ca să evitați conflictele.

## 4. Împărțirea pentru M2

| Membru | Responsabilitate | Teste |
|---|---|---|
| **Stoica Andrei-Vlad** | autentificare JWT + roluri, rutele pentru obiecte și licitații, tranziții + planificator, filtrare/ordonare/paginare | permisiuni, validare, tranziții, listări |
| **Stoian Erik** | serviciul tranzacțional de ofertare (`POST /api/auctions/:id/bids`), varianta nesigură pentru demonstrație, `load/verify-invariants.js` | CON-1..6 |
| **Stilpeanu Tudor** | gateway Socket.IO (camere, autentificare), clientul conectat la reducer, integrarea cu cursul valutar | RTM-1..7 |

Funcțiile pure din M1 (`evaluateBid`, `canTransition`, `applyAuctionEvent`) sunt baza pe care fiecare își construiește
partea în M2.

## 5. Reguli

- Fiecare își scrie singur codul și testele și le poate explica la susținere; un agent AI poate fi folosit, dar diff-ul se inspectează și testele se rulează de autor (vezi [ai-usage.md](docs/ai-usage.md)).
- Commit-uri mici, cu mesaje clare; fiecare commit apare pe numele celui care a făcut munca.
- Nu se adaugă în Git `.env`, baze de date sau `node_modules`.
- `main` trebuie să treacă mereu `npm test`.
