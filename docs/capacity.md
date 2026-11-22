# Capacitate și profil de sarcină

> Etapa **M1**: modelul de sarcină, obiectivele și planul testului. Măsurătorile se completează în M3
> (tabelul de rezultate de la final).

## 1. Model de sarcină

| Dimensiune | Valoare | Sursă |
|---|---|---|
| Licitatori simultani | **20** (conectați live + trimit oferte) | fișa temei |
| Oferte în scenariul de referință | **100** încercări de ofertare către aceeași licitație („fierbinte”) | fișa temei |
| Oferte concurente la același preț | rafale de 20 de oferte simultane cu suma = minimul curent | pachet CON |
| Ordine diferită la client | cel puțin 2 evenimente livrate în ordine inversă (întârziere injectată în testul RTM) | fișa temei |
| Clienți live per licitație | 20 licitatori + 1 organizator | RTM |
| Volum de date (seed) | 1 organizator, 50 licitatori, 120 obiecte, 200 licitații (40 `ACTIVE`, 10 `SCHEDULED`, 10 `DRAFT`, 120 `ENDED`, 20 `CANCELLED`), ≈ 1.850 oferte istorice (seed implicit 2026) | ales de echipă pentru realismul listărilor paginate; `npm run seed` |

### Mixul de operații în scenariul de referință (per licitator virtual)

| Operație | Tip | Pondere estimată |
|---|---|---|
| `POST /api/auth/login` | scriere ușoară (bcrypt — costisitor CPU) | o dată la început |
| conectare Socket.IO + `auction:join` | conexiune persistentă | o dată |
| `GET /api/auctions/:id` | citire | la intrare + după fiecare `409` |
| `POST /api/auctions/:id/bids` | **scriere critică (tranzacție)** | 5 oferte / licitator (100 total) |
| `GET /api/auctions?status=ACTIVE&page=…` | citire paginată | 1–2 / licitator |
| recepție `bid:accepted` | broadcast | ~ toate ofertele acceptate × 21 clienți |

Login-ul este exclus din măsurarea latenței ofertelor (se face în faza de pregătire), pentru a nu amesteca costul bcrypt cu cel al tranzacției.

## 2. Obiective (propuse de echipă — fișa nu le fixează)

| Metrică | Obiectiv la nivelul de referință (20 licitatori) |
|---|---|
| p95 latență `POST bid` | ≤ 200 ms |
| p50 latență `POST bid` | ≤ 50 ms |
| p95 întârziere propagare `commit → recepție client` | ≤ 300 ms |
| Rata erorilor tehnice (5xx, timeouts, conexiuni refuzate) | 0 % |
| Răspunsuri `409` (respingeri de business) | raportate separat — **nu** sunt erori |
| Invariante I1–I6 după rulare | 100 % respectate (`verify-invariants`) |

## 3. Niveluri de încărcare

| Nivel | Licitatori virtuali | Oferte totale | Rată de sosire | Scop |
|---|---|---|---|---|
| **L1 – ușor** | 5 | 25 | ~ 5 oferte/s | referință, fără contenție |
| **L2 – țintă** | 20 | 100 | ~ 20 oferte/s, cu rafale simultane | scenariul din fișă |
| **L3 – stres** | 50 | 250 | ~ 50 oferte/s | depășire a țintei ×2,5; identificarea blocajului |
| L4 – saturare *(opțional)* | creștere până la p95 > 200 ms sau erori > 0 | – | rampă | estimarea capacității maxime |

Fiecare nivel: 3 rulări, se raportează mediana rulărilor. Baza de date este re-seed-uită înainte de fiecare rulare (seed fix).

## 4. Instrumente și scripturi (de implementat)

| Fișier | Rol |
|---|---|
| `load/scenario-bids.yml` | Artillery: faze L1/L2/L3, login în `before`, `POST bid` cu sume generate determinist |
| `load/scenario-rtm.yml` | Artillery cu motorul Socket.IO: 20 clienți în cameră |
| `load/rtm-clients.js` | Node: 20 clienți `socket.io-client`, măsoară întârzierea per eveniment, verifică ordinea `seq` |
| `load/verify-invariants.js` | citește SQLite după rulare și verifică I1–I6 |
| `npm run load:l1` / `load:l2` / `load:l3` | rulare reproductibilă |

Metrici colectate: throughput (req/s), p50/p95/p99 latență, rata erorilor, număr de `201`/`409`, întârziere live
p50/p95/max, CPU și memorie ale procesului Node (`process.cpuUsage()`, `process.memoryUsage()` expuse temporar
la un endpoint de diagnostic doar în modul de test, sau Task Manager / `top`).

## 5. Mediul de test (de completat la rulare)

| Element | Valoare |
|---|---|
| Calculator / CPU / nuclee | _de completat_ |
| RAM | _de completat_ |
| Sistem de operare | _de completat_ |
| Versiune Node.js | _de completat_ |
| Mod | `NODE_ENV=production`, build SPA, fără `--watch` |
| SQLite | fișier local pe SSD, WAL, `busy_timeout=5000` |
| Generator de sarcină | pe aceeași mașină (se notează impactul asupra CPU) |

Rezultatele nu se compară între calculatoare diferite; se compară doar nivelurile între ele pe același mediu.

## 6. Blocaj așteptat (ipoteză de verificat)

**Lock-ul de scriere SQLite**: toate ofertele trec printr-o tranzacție `IMMEDIATE`, deci sunt serializate global.
Estimare: dacă o tranzacție de ofertă durează ~ 2–5 ms, debitul maxim teoretic ≈ 200–500 oferte/s pe proces; la L3 ne
așteptăm să vedem creșterea p95 din cauza așteptării la lock, nu din cauza CPU. Ipoteze secundare: costul bcrypt la
login (dacă login-ul ar intra în fereastra de măsurare) și serializarea JSON a broadcast-urilor (neglijabilă la 21 clienți).

## 7. Rezultate (M3)

| Nivel | Throughput | p50 | p95 | Erori | 201 / 409 | Întârziere live p95 | CPU / RAM |
|---|---|---|---|---|---|---|---|
| L1 | | | | | | | |
| L2 | | | | | | | |
| L3 | | | | | | | |

**Capacitate susținută estimată:** _de completat_ · **Blocaj observat:** _de completat_
