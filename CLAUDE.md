# Configuratore Pareti — istruzioni di progetto

App per **progettare pareti di foto** dei clienti di uno studio fotografico: si parte da
una **foto frontale** della parete e dalle sue **misure** reali (L×H in cm), si provano
configurazioni di cornici/pannelli **in scala**, e si esportano **proposte in PDF** per il
cliente. Due momenti di vendita:
1. **Carta dei gusti** — più varianti di *stile* a confronto (geometrico/mosso/misto), senza
   prezzi, per capire l'orientamento del cliente.
2. **Proposta commerciale** — 2–3 soluzioni rifinite (formati misti: cornice/pannello/tela),
   sulla foto reale della parete, **con preventivo e prezzi**.

L'autore (**Mauro**, fotografo) parla **italiano: rispondi in italiano.**

## Decisioni architetturali (non rimetterle in discussione senza motivo)

- **App statica**: solo HTML + JavaScript vanilla, **nessun build**, nessun framework. Si apre
  servendola da un server statico (vedi sotto). Niente dipendenze npm.
- **Due repo separati**:
  - **`pareti-config`** (QUESTO) — il codice dell'app. **Pubblico**, pubblicato su GitHub Pages.
    **Mai dati cliente qui** (il `.gitignore` esclude `progetti/`, `foto/`, `pareti-backup*.json`).
  - **`pareti-clienti-dati`** — archivio dei clienti. **Privato**. Contiene `progetti/<id>.json`
    e `foto/<id>.jpg`. È la cartella che l'app apre come "Archivio".
- **Persistenza = file nella cartella dati**, via **File System Access API** (Chrome/Edge).
  Git dà storico + sincronizzazione multi-computer. Fallback su localStorage/IndexedDB quando
  la cartella non è collegata (modalità *legacy*, zero regressioni). Vedi `configuratore/store.js`.
- **Privacy**: nomi, foto e proposte dei clienti stanno **solo** nel repo dati privato. Il
  progetto di default in codice è un *Progetto dimostrativo* neutro (nessun dato reale).

## Avvio in locale

Il File System Access richiede un **contesto sicuro**: `localhost` va bene, `file://` **no**.

```
cd pareti-config
python3 -m http.server 8799            # un qualsiasi server statico
# apri http://localhost:8799/ in CHROME (o Edge)
```

Nella barra **Archivio** in alto → *Collega una cartella* → scegli un clone locale del repo
`pareti-clienti-dati`. Da quel momento l'app legge/scrive i file dei progetti lì. Il permesso
della cartella è legato all'**origine** (es. `localhost:8799` ≠ `tuo-utente.github.io`): a ogni
nuova origine va ri-scelta la cartella una volta (i file restano gli stessi).

## Struttura

```
index.html              UI, stile (un unico <style>), avvio asincrono, barra Archivio, stampa
configuratore/
  store.js   window.Persist — persistenza: backend 'fs' (cartella) o 'legacy' (browser),
             migrazione, import/export backup. Caricato PRIMA di ui.js.
  engine.js  motori di disposizione (cost/righe/colonne/griglia); fmtEff()/frameDims();
             TIPO_NAMES/TIPO_SHORT/fmtTipo() (tipi di supporto).
  ui.js      stato globale (store, P), progetti, editor impostazioni, rendering pareti
             (makeFrameEl rende i 4 tipi di supporto), prezzi/totali (fmtPrice/projPriceTotal/eur).
  photos.js  foto del cliente nelle cornici (pool per progetto, via Persist).
  tabs.js    Anteprima Reale (foto parete + calibrazione prospettica a 4 punti, omografia),
             scheda Montaggio, scheda Analisi (con tabella Preventivo).
  proposte.js proposte = "offerte complete" (vedi sotto) + generazione dei due PDF.
```

I file `configuratore/*.js` sono script globali (non moduli): condividono variabili/funzioni
via `window`. Ordine di caricamento in `index.html`: store → engine → ui → photos → proposte → tabs.

## Modello dati

`store = { projects:[…], currentId }`. Persistito come **un file per progetto**
`progetti/<project.id>.json` (NON il blob intero); `currentId` in localStorage.

**Progetto** `P`:
```js
{ id, name,
  formats:[ Formato ],
  walls:[ Parete ],
  structure:'cost'|'righe'|'colonne'|'griglia', ord:0..1, gap, orient:bool,
  photoPool:[{id,name}], proposte:[ Proposta ], showPhotos:bool, photoSeed }
```
**Formato** (un formato = una taglia + un tipo di supporto + un prezzo):
```js
{ id, name, w, h,                 // foto in cm
  tipo:'cornice_pp'|'cornice'|'pannello'|'tela',
  pp,                             // passepartout per lato (solo cornice_pp)
  cw, cc:'nera'|'bianca',         // larghezza/colore cornice (solo tipi cornice)
  central:bool,                   // raggruppa al centro (struttura costellazione)
  prezzo }                        // € cad. → listino per formato+tipo
```
`fmtEff(f)` ricava la geometria effettiva dal tipo (pannello/tela = bordo 0; cornice = solo
bordo; cornice_pp = bordo + passepartout). Usala sempre, non leggere pp/cw grezzi.

**Parete**:
```js
{ id, name, note, w, h, seed,
  photo: dataURL|null,            // foto reale parete (oggi base64 inline — vedi refinement)
  photoRatio, corners:{tl,tr,br,bl}|null,   // calibrazione (coord. normalizzate 0..1)
  counts:{ fmtId:n }, countsH:{ fmtId:n } } // quantità verticali / orizzontali
```
**Proposta = OFFERTA COMPLETA**: congela disposizione **e** formati+quantità+prezzi, così
proposte diverse possono avere supporti/totali diversi:
```js
{ id, name, date, include,
  structure, ord, gap, orient, photoSeed, seeds:{ wallId:seed },
  formats:[…], counts:{ wallId:{fmtId:n} }, countsH:{ wallId:{fmtId:n} } }
```
`snapshotConfig()`/`applyConfig()` salvano/ripristinano tutto questo; `loadProposta` sovrascrive
i formati/quantità correnti con quelli della proposta. Le proposte **vecchie** senza
`formats/counts` restano valide (usano i formati correnti — retro-compatibilità).

**Foto cliente**: `foto/<photoId>.jpg` (fs) o IndexedDB (legacy); il progetto tiene solo gli id
nel `photoPool`. **Backup** (universale, ogni browser): `{ type:'parete-backup', v, date,
store:{projects,currentId}, photos:{ id:dataUrl } }` — vedi Persist.importBackup/exportBackup
e i pulsanti Importa/Esporta nella barra Archivio.

## PDF (stampa)

`window.print()` con `@page A3 landscape`; in stampa si mostra solo `#printDoc`
(`body.printing-client`). Due generatori in `proposte.js`:
- `generateTasteCard()` → carta dei gusti: mockup grande pulito + etichetta di stile, niente prezzi.
- `generateCommercialPDF()` → per proposta: mockup **proiettato sulla foto reale** (omografia,
  `buildProjectedMockup`) + pagina **Preventivo** (formato·supporto·q.tà·prezzo·subtotale·totale).
Entrambi iterano le proposte spuntate (`include`); senza spunte usano la config corrente.

## Stato e roadmap (al 18 giugno 2026)

- **Fase 0** ✓ persistenza su file (File System Access) + due repo + backup/import-export + privacy.
- **Fase 1** ✓ tipi di supporto (cornice/​cornice+pp/​pannello/​tela) + listino per formato+tipo + totali.
- **Fase 2** ✓ i due PDF (carta dei gusti + commerciale con preventivo) + proposte come offerte complete.
- **Fase 3** (DA FARE) controllo manuale della composizione: fissare una foto al centro, ingrandire
  le foto preferite del cliente, definire zone della parete da evitare (finestra/mobile/interruttore).
- **Refinement noto**: le foto-parete dell'Anteprima Reale sono salvate come base64 dentro il JSON
  del progetto → conviene salvarle come file separati (`foto-pareti/<wallId>.jpg`) per diff git puliti.

## Partire su un'altra macchina

1. `git clone` di **`pareti-config`** (questo repo) e di **`pareti-clienti-dati`** (privato).
2. `cd pareti-config && python3 -m http.server 8799`, apri `http://localhost:8799/` in Chrome.
3. Barra Archivio → *Collega una cartella* → scegli il clone di `pareti-clienti-dati`.
4. Le modifiche ai dati si committano/pushano da quel repo (consigliato: GitHub Desktop).

Senza la cartella dati l'app funziona comunque in modalità *browser* (legacy), ma i dati non
sono né portabili né storicizzati: serve collegare la cartella.
