# Utilizarea instrumentelor AI

> Se completează pe parcurs. Nu se cer transcrieri complete — doar rezumatul și câte un caz tehnic semnificativ per student.

## 1. Instrumente folosite

| Instrument | Unde / pentru ce | Cine |
|---|---|---|
| Claude Code (agent de codare) | M1: redactarea inițială a documentelor de analiză/design și a scheletului; revizuite de echipă | Stoica Andrei-Vlad |
| Claude Code (agent de codare) | M1: propunere pentru `evaluateBid` și testele unitare, revizuirea textului CON / ADR-0002; diff inspectat și teste rulate de autor | Stoian Erik |
| Codex (VS Code / CLI) | _de completat dacă este folosit_ | |

## 2. Reguli de lucru ale echipei

Urmăm fluxul din seminarii: **înțelege → reproduce → delimitează → cere agentului → inspectează diff-ul → rulează
verificările → diagnostichează → reparație țintită → verifică → explică**.

- Fiecare cerere către agent are patru părți: **Scop**, **Context**, **Constrângeri**, **Gata când**.
- O cerere = un comportament / un defect / o limită; nu „construiește toată aplicația”.
- Respingem: modificări în fișiere nerelevante, dependențe noi nejustificate, teste slăbite, presupuneri de securitate ascunse.
- Nu trimitem agentului secrete, `.env`, baze de date sau date personale.
- Ieșirea agentului este o propunere, nu o dovadă: testele le rulăm noi, iar fiecare membru își explică singur codul.

## 3. Cazuri tehnice (câte unul per student)

Șablon:

| Câmp | Conținut |
|---|---|
| Student | |
| Cerință | ce comportament trebuia obținut |
| Intervenția agentului | ce a propus (pe scurt) |
| Inspecție | ce am verificat în diff / ce test am rulat |
| Defect / limitare găsită | ce era greșit sau incomplet |
| Remediere | ce am schimbat și de ce |
| Rezultat | dovada (test care trece, măsurătoare, commit) |

### Caz 1 — Stoica Andrei-Vlad

_de completat_

### Caz 2 — Stoian Erik

| Câmp | Conținut |
|---|---|
| Student | Stoian Erik |
| Cerință | Funcția pură `evaluateBid(auction, { bidderId, amount, role }, now)` pentru regulile R1–R6, cu testele U-BID-1..7 și U-VAL-1. Gata când: toate cazurile din [testing.md §2.1](testing.md#21-unitate--reguli-de-business) trec și funcția nu aruncă excepții pentru nicio intrare (serviciul din M2 o apelează în tranzacție, iar o excepție acolo ar deveni `500`). |
| Intervenția agentului | Claude Code a propus `server/src/domain/bid-rules.js` (`validateAmount`, `minimumBid`, `evaluateBid`, `BID_ERROR_STATUS`) și testele. Pentru detaliile lui `AUCTION_CLOSED` a scris `new Date(endsAt).toISOString?.() ?? null`, presupunând că pentru o dată invalidă rezultatul este `undefined` și se folosește `null`. |
| Inspecție | Am citit diff-ul pe ramura cu cerința „nu aruncă excepții”. `?.` protejează doar de o metodă lipsă, nu de o metodă care aruncă. Am verificat separat: `node -e "new Date(NaN).toISOString?.()"` → `RangeError: Invalid time value`. |
| Defect / limitare găsită | Pentru o licitație `ACTIVE` cu `endsAt` lipsă sau corupt, `evaluateBid` ar fi aruncat `RangeError` în loc să întoarcă `AUCTION_CLOSED` → în M2 ar fi fost `500` din interiorul tranzacției. Niciunul dintre cazurile U-BID din plan nu acoperea situația, deci testele planificate ar fi trecut cu defectul prezent. |
| Remediere | Verificare explicită `Number.isNaN(endsAt) ? null : new Date(endsAt).toISOString()`; comparația `!(now < endsAt)` tratează `NaN` ca licitație închisă (implicit refuzat), nu ca deschisă la nesfârșit. Am adăugat testul „o licitație ACTIVE fără endsAt valid este tratată ca închisă” (`endsAt: null` și `endsAt: "nu-e-data"`). |
| Rezultat | `node --test tests/unit/bid-rules.test.js` → 36/36; `c8` pe `src/domain/bid-rules.js` → 100 % statements și branches. Commit `feat(domain): regula de validare a ofertelor`. Lecție: cerința „funcție pură care nu aruncă” se transformă în teste cu intrări invalide, nu doar cu cele din plan. |

### Caz 3 — Stilpeanu Tudor

_de completat_

## 4. Candidați de caz identificați în M1

- Pe SQLite, `DataTypes.ENUM` devine `TEXT` fără validare (demonstrat la seminarul 7) — un model generat cu `ENUM` pentru `status` ar accepta valori invalide. Se verifică cu un test care încearcă `status: "FOO"`.
- Dependența circulară `Auctions.leaderBidId ↔ Bids.auctionId` blochează `sequelize.sync()`; soluția aleasă: `leaderId` → `Users`.
- Agentul a numit documentul pachetului `docs/packages/con.md`; pe Windows `CON` este nume rezervat de dispozitiv, iar `git add` a eșuat („unable to index file”). Fișierele au fost redenumite `con-concurenta.md` / `rtm-timp-real.md` și link-urile actualizate.
- `Model.update(...)` static rulează validatorii de model pe un obiect parțial: validatorul „`leaderId` și `currentPrice` împreună” a respins o actualizare doar a prețului. În servicii vom actualiza prin instanță (sau vom trimite ambele câmpuri); testul de corupere folosește SQL direct.
- Contorul `seq` incrementat și la tranziții face ca `seq`-urile ofertelor acceptate să nu fie contigue — invarianta I4 a fost reformulată („distincte și crescătoare”, nu „contigue”).
