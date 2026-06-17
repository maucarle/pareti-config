# Configuratore Pareti — app

Strumento per progettare pareti di foto incorniciate / pannelli partendo da una
**foto frontale** della parete e dalle **misure** reali. Genera configurazioni
(costellazione, righe, colonne, griglia), permette di salvarle come **proposte**
e di esportarle in **PDF** per il cliente.

App statica (HTML + JS, nessun build). Solo l'app vive in questo repo, che è
**pubblico** e pubblicato su GitHub Pages.

## I dati dei clienti NON stanno qui

Progetti, foto e proposte dei clienti vivono in un repo **privato** separato
(`pareti-clienti-dati`) come file:

```
progetti/<id>.json     un progetto/cliente
foto/<id>.jpg          le foto del cliente
```

L'app legge/scrive quella cartella tramite **File System Access API** (Chrome/Edge):
barra **Archivio** → *Collega una cartella*. Così i dati sono portabili fra
computer e storicizzati con git, senza mai finire nel repo pubblico.

## Uso in locale

Serve un server locale (il File System Access richiede un contesto sicuro:
`localhost` va bene; `file://` no):

```
python3 -m http.server 8799
# poi apri http://localhost:8799/ in Chrome
```

## Pubblicazione

GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.

## Struttura

```
index.html              UI e avvio
configuratore/
  store.js              persistenza: cartella (File System Access) o browser (fallback)
  engine.js             motori di disposizione (costellazione/righe/colonne/griglia)
  ui.js                 stato, progetti, editor, rendering pareti
  photos.js             foto cliente nelle cornici
  tabs.js               Anteprima Reale (foto parete + calibrazione)
  proposte.js           proposte salvate + PDF cliente
```

## Backup

La barra Archivio ha **Esporta backup** / **Importa backup**: un singolo file
JSON con tutti i progetti e le foto. Funziona in qualsiasi browser ed è la rete
di sicurezza per spostare i dati o recuperarli.
