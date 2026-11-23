# ADR-0001 — Transport live și reconcilierea stării (RTM)

- **Stare:** Propus (M1) — se confirmă sau se revizuiește după experimentele din M2/M3
- **Pachet:** RTM
- **Data:** 2026-11-22

## Problemă

Licitatorii trebuie să vadă oferta acceptată, liderul, termenul și rezultatul fără refresh, cu întârziere mică, chiar dacă
pierd temporar conexiunea sau dacă evenimentele ajung în altă ordine. Trebuie verificată și autorizarea mesajelor.

## Alternative

1. Polling scurt / long polling
2. Server-Sent Events (SSE) + `Last-Event-ID`
3. WebSocket nativ (`ws`)
4. Socket.IO

și, pentru reconciliere: aplicare oarbă, ordonare după `seq`, reluare din jurnal de evenimente, instantaneu la reconectare.
Comparația detaliată: [packages/rtm-timp-real.md](../packages/rtm-timp-real.md).

## Decizie

**Socket.IO** pentru notificări server → client, cu camere per licitație și autentificare la handshake prin cookie-ul JWT.
Scrierile (ofertele) rămân exclusiv pe REST. **Reconcilierea**: fiecare eveniment poartă `seq = auction.version`; clientul
aplică doar `seq = lastSeq + 1`, ignoră duplicatele/evenimentele vechi și cere un instantaneu la gol sau reconectare.

Motive principale: reconectare și heartbeat gata făcute, camere, middleware de autentificare, suport în Artillery pentru
testul de încărcare, acoperit la curs. Corectitudinea nu depinde de garanțiile transportului, ci de `seq` + instantaneu.

## Experiment / test (planificat)

- RTM-1: 20 clienți, 100 oferte → toți converg la starea din DB; p95 întârziere `commit → recepție` ≤ 300 ms.
- RTM-2: reconectare forțată cu 3 oferte ratate → convergență.
- RTM-3: evenimente permutate (`5, 7, 6, 6`) → `7` declanșează `needsResync` fără a fi aplicat, duplicatul `6` este ignorat, iar după instantaneu starea corespunde `seq = 7`, fără regres de stare.
- RTM-4..6: autorizare la handshake, la `auction:join` și ignorarea mesajelor de scriere de la client.

Rezultatele (tabele, grafice, comenzi de reproducere) se adaugă aici în M2/M3.

## Consecințe și limite

- (+) Un singur cod de reconciliere pentru ordine diferită, duplicate și reconectare.
- (+) Fără tabel suplimentar de evenimente.
- (−) Dependență de protocolul Socket.IO pe client și în testele de încărcare.
- (−) Un singur proces; scalarea orizontală ar cere adaptor partajat.
- (−) Măsurarea întârzierii este validă doar cu clienți pe aceeași mașină cu serverul.
- Dacă experimentele arată probleme (ex. overhead la 20 clienți), alternativa de rezervă este SSE cu `Last-Event-ID = seq`.
