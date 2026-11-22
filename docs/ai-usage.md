# Utilizarea instrumentelor AI

> Se completează pe parcurs. Nu se cer transcrieri complete — doar rezumatul și câte un caz tehnic semnificativ per student.

## 1. Instrumente folosite

| Instrument | Unde / pentru ce | Cine |
|---|---|---|
| Claude Code (agent de codare) | M1: redactarea inițială a documentelor de analiză/design și a scheletului; revizuite de echipă | Stoica Andrei-Vlad |
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

_de completat_

### Caz 3 — Stilpeanu Tudor

_de completat_

## 4. Candidați de caz identificați în M1

- Pe SQLite, `DataTypes.ENUM` devine `TEXT` fără validare (demonstrat la seminarul 7) — un model generat cu `ENUM` pentru `status` ar accepta valori invalide. Se verifică cu un test care încearcă `status: "FOO"`.
- Dependența circulară `Auctions.leaderBidId ↔ Bids.auctionId` blochează `sequelize.sync()`; soluția aleasă: `leaderId` → `Users`.
- Agentul a numit documentul pachetului `docs/packages/con.md`; pe Windows `CON` este nume rezervat de dispozitiv, iar `git add` a eșuat („unable to index file”). Fișierele au fost redenumite `con-concurenta.md` / `rtm-timp-real.md` și link-urile actualizate.
- `Model.update(...)` static rulează validatorii de model pe un obiect parțial: validatorul „`leaderId` și `currentPrice` împreună” a respins o actualizare doar a prețului. În servicii vom actualiza prin instanță (sau vom trimite ambele câmpuri); testul de corupere folosește SQL direct.
- Contorul `seq` incrementat și la tranziții face ca `seq`-urile ofertelor acceptate să nu fie contigue — invarianta I4 a fost reformulată („distincte și crescătoare”, nu „contigue”).
