# Pachetul RTM — Colaborare în timp real

> Stare: **M1 – analiză și alternative**. Implementare și dovezi: M2/M3.
> Decizie: [ADR-0001](../adr/0001-rtm-transport-si-reconciliere.md)

## 1. Cerința injectată, aplicată temei

| Cerință generală RTM | Interpretare în „Licitații în timp real” |
|---|---|
| Clienți multipli observă modificări fără refresh manual | Toți cei care au deschisă o licitație văd imediat oferta acceptată, noul lider, prețul minim următor, schimbările de stare și rezultatul final; lista de licitații se actualizează live. |
| Controlul stării învechite | Fiecare eveniment are `seq` (= `auction.version`); clientul detectează evenimente vechi, duplicate sau lipsă și se resincronizează din instantaneul serverului. |
| 20 clienți conectați; întârzieri măsurate | 20 de clienți Socket.IO autentificați în camera aceleiași licitații; se măsoară întârzierea `commit → recepție` (p50/p95/max). |
| Reconectări | Clientul pierde conexiunea, se plasează oferte între timp, clientul revine și ajunge la starea din DB. |
| Verificarea autorizării mesajelor | Fără autentificare → conexiune refuzată; licitator → nu poate intra în camera unei licitații `DRAFT`; mesajele „de scriere” trimise de client sunt ignorate. |
| Fișa temei | „Actualizare și reconectare live”; „cel puțin două evenimente sosite în ordine diferită la client”. |

## 2. Alternative de transport

| # | Alternativă | Avantaje | Dezavantaje |
|---|---|---|---|
| A | **Polling scurt** (`GET` la 1 s) | trivial, funcționează peste tot | latență până la intervalul de polling; 20 clienți × 1 req/s = 20 req/s doar pentru citiri; nu scalează la latență mică |
| B | **Long polling** | latență mai mică | complexitate pe server, reconexiuni la fiecare mesaj |
| C | **Server-Sent Events (SSE)** | nativ în browser (`EventSource`), reconectare automată cu `Last-Event-ID` — se potrivește perfect cu `seq`; doar HTTP | unidirecțional (suficient — scrierile merg prin REST); fără camere — trebuie implementate; limită de conexiuni HTTP/1.1 per domeniu |
| D | **WebSocket nativ (`ws`)** | bidirecțional, overhead minim | reconectare, heartbeat, camere și autentificare se implementează manual |
| E | **Socket.IO** | camere, reconectare automată cu backoff, heartbeat, middleware de autentificare la handshake, fallback pe polling; prezentat la curs (C13); suport nativ în Artillery | protocol propriu (clientul trebuie să fie Socket.IO); bibliotecă în plus pe ambele părți; „livrare cel mult o dată” — mesajele din timpul deconectării se pierd |

## 3. Alternative de reconciliere a stării

| # | Strategie | Descriere | Evaluare |
|---|---|---|---|
| R1 | Aplicare oarbă | fiecare eveniment suprascrie starea | evenimentele în ordine inversă lasă un preț vechi pe ecran — **respins** |
| R2 | **Ordonare după `seq`** | aplică doar `seq = lastSeq + 1`; ignoră `seq ≤ lastSeq`; la gol (`seq > lastSeq + 1`) evenimentul nu se aplică, iar `needsResync = true` | determinist, simplu de testat ca funcție pură (reducer) |
| R3 | Reluare de evenimente din jurnal | serverul păstrează toate evenimentele și le retrimite după `lastSeq` | complet, dar necesită tabel de evenimente (apropiat de pachetul AUD) |
| R4 | **Instantaneu la reconectare** | după reconectare sau gol, clientul cere starea curentă (`snapshot`, cu `version`) + istoricul `afterSeq` din REST | robust, fără jurnal suplimentar; un singur cod de reconciliere |

## 4. Decizie propusă

**Socket.IO (E) + ordonare după `seq` (R2) + instantaneu la reconectare / gol (R4).**

- Socket.IO doar pentru notificări server → client; scrierile rămân pe REST (o singură cale tranzacțională, compatibilă cu CON).
- Camere: `auction:<id>` și `lobby`. Emiterea are loc după commit.
- Reducerul clientului `applyAuctionEvent(state, event)` este o funcție pură, testată cu permutări de evenimente.
- La `connect` (inclusiv reconectare) clientul reintră automat în camerele active și primește `snapshot`; dacă `snapshot.version ≥ lastSeq`, starea este înlocuită, `needsResync` devine `false` și istoricul este completat cu `GET /api/auctions/:id/bids?afterSeq=lastSeq`; un instantaneu cu `version < lastSeq` este ignorat.
- SSE (C) rămâne alternativa principală; ADR-ul documentează de ce nu a fost ales.

## 5. Verificări obligatorii planificate

| ID | Scenariu | Dovadă așteptată |
|---|---|---|
| RTM-1 | 20 clienți Socket.IO autentificați în aceeași cameră; se plasează 100 de oferte | fiecare client primește toate evenimentele `bid:accepted`; starea finală la cei 20 = starea din DB; întârziere p50/p95/max raportată (țintă p95 ≤ 300 ms) |
| RTM-2 | Reconectare: clientul X este deconectat forțat, se acceptă 3 oferte, X revine | după reconectare `X.version = DB.version`, `X.currentPrice = DB.currentPrice`, istoricul complet; UI a arătat „Reconectare…” |
| RTM-3 | Ordine diferită: evenimentele `seq = 5, 7, 6` (și duplicat `6`) aplicate reducerului | `seq = 7` nu se aplică (gol): starea rămâne la `seq = 5` și `needsResync = true`; după instantaneul cu `version = 7` starea corespunde `seq = 7`, iar `seq = 6` sosit după el este ignorat (`seq ≤ lastSeq`); fără regres de stare; test unitar + test de integrare cu întârziere injectată în gateway |
| RTM-4 | Autorizare: conexiune fără cookie / cu JWT expirat | `connect_error` `UNAUTHENTICATED` |
| RTM-5 | Autorizare: licitator → `auction:join` pe licitație `DRAFT` | ack `{ ok:false, error:{ code:"NOT_FOUND" } }`; nu primește evenimente |
| RTM-6 | Client emite `bid:accepted` / `bid:place` falsificat | ignorat; nicio modificare în DB, niciun broadcast |
| RTM-7 | Ofertă respinsă (`409`) | niciun eveniment emis (I3) |

Instrumente: test de integrare cu `socket.io-client` (în `node:test`), script `load/rtm-clients.js` pentru 20 clienți și
măsurarea întârzierii, scenariu Artillery cu motorul Socket.IO pentru testul comun de încărcare, Playwright pentru E2E
(două contexte de browser).

## 6. Limite cunoscute

- Măsurarea întârzierii folosește `serverTime` din eveniment și ceasul clientului: este corectă doar când clienții rulează pe aceeași mașină ca serverul (cazul testelor). Se documentează.
- Un singur proces Node; scalarea orizontală ar necesita adaptor Socket.IO (Redis) — în afara scopului.
- Livrarea Socket.IO nu este garantată; corectitudinea vine din `seq` + instantaneu, nu din transport.
