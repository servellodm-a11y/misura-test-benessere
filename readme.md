# Misura – Test e Benessere · landing page (palette calda + hero "wow")

Landing page **identica nell'architettura, nei testi, nelle immagini e nei contenuti**
all'originale, con una nuova veste cromatica calda e una hero cinematografica.

## Cosa cambia (e cosa NON cambia)

**Cambia**
- **Palette calda** (ambra · terracotta · sabbia) al posto dei toni teal/verde/ciano
- **Hero con cellule fotorealistiche in movimento**: globuli rossi biconcavi (disco frontale,
  obliqui e di profilo), leucocita con nucleo polilobato, piastrine, pile *rouleaux*, correnti
  di plasma, fibrille, polvere corpuscolata, flusso laminare e profondità di campo su 4 livelli.
  Le celle sono immagini fotografiche (cartella `img/cells/`) proiettate su un canvas: niente
  disegno vettoriale, nessun effetto "confetto".
- **Dinamica 3D**: le immagini di sezione sono pannelli sospesi che si inclinano seguendo lo
  scorrimento (±13°) e il puntatore (±15°), con ombra proiettata che cresce avvicinandosi;
  card e passaggi si inclinano verso il cursore (±11°) in prospettiva, con ingresso in
  sequenza; gli aloni di sezione accompagnano la pagina
- **Effetto wow all'ingresso**: sipario di apertura, titolo che si mette a fuoco riga per
  riga, onde di luce che respirano, riflesso che attraversa la scena, cellule che irrompono
  e si stabilizzano; poi luce che segue il cursore, card con alone e leggera inclinazione 3D,
  bottoni magnetici, barra di avanzamento lettura, comparse a cascata
- Gradazione calda sulle fotografie (il ritratto resta naturale)

**NON cambia**
- Testi, sezioni, ordine, modali, FAQ, contatti, link WhatsApp / email / telefono / LinkedIn
- Immagini originali (stessi file, non ritagliati né sostituiti)
- Le 4 lingue (IT / EN / ES / FR) e tutte le loro stringhe
- Il logo, che resta riconoscibile

## File

| File | Cosa è |
|---|---|
| `index.html` | la landing page completa (CSS e JS inclusi, un unico file) |
| `img/` | tutte le immagini originali + `img/cells/` (14 sprite delle cellule) |
| `video/hero.mp4` | il video originale (non più proiettato in hero: vedi nota) |
| `ANTEPRIMA.html` | versione con immagini incorporate, per verifica rapida offline |
| `README.md` | questo file |

## Pubblicazione su Netlify

1. Trascina la cartella (o lo ZIP) in Netlify → *Deploy manuale*.
2. Nessuna build richiesta: sito statico, `index.html` è la home.
3. Verifica i link che preferisci: ancore `#...`, WhatsApp, email, telefono, LinkedIn.

## Personalizzazione rapida (`index.html`)

- **Colori** — in cima, dentro `<style>`, blocco `:root`:

      --bg:#fdf7f0     sfondo caldo di pagina
      --ink:#2a1810    testo principale
      --teal:#b8431f   accento primario (terracotta)
      --green:#de8a2a   accento secondario (ambra)
      --cyan:#edae4a    accento terziario (ocra)

  Cambiando questi cinque valori si sposta tutta la palette.
- **Densità delle cellule** — nello script in fondo:

      var n = Math.round(W * H / 11500);   /* più basso = più cellule (sotto i 760 px: /15000) */
      /* posizione: la funzione spawn() decide dove nascono. All'altezza del titolo il 45%
         delle cellule resta sul fondo (piccola e sfocata) per riempire senza disturbare;
         la funzione riempiVuoti() controlla una griglia e aggiunge cellule dove c'è spazio
         vuoto, così nessuna zona della scena resta spoglia */
- **Inclinazione 3D** — `var baseX = (0.5 - p) * 13.5;` (pannelli immagine, legata allo
  scorrimento), `px = hx * 15` (pannelli, puntatore), `* 11` nel blocco delle card.
- **Sostituire una cellula** — basta rimpiazzare il PNG dentro `img/cells/` (fondo trasparente):
  `rbc-1…7` globuli rossi, `rbc-edge` profilo di taglio, `rouleaux` pila, `platelet-1…4`,
  `wbc` leucocita. Lo script li carica per nome.
- **Velocità del flusso** — `p.sp = (0.10 + Math.random()*0.30)` in `makeCell`.
- **Video in hero** — è volutamente spento: il filmato originale è un campo di puntini blu
  che sbiadisce le cellule. Per riattivarlo, togli il commento al blocco "video hero" in
  fondo allo script; `video/hero.mp4` è già incluso.

## Prestazioni

- Le sprite delle cellule sono ridimensionate (max 340 px) e i livelli di fuoco vengono
  preparati **solo al primo utilizzo**: memoria contenuta anche su mobile.
- L'alone caldo della hero è disegnato una volta e poi solo traslato (nessun filtro
  ridisegnato a ogni fotogramma): è la modifica che ha più che triplicato i fotogrammi
  al secondo, portando la pagina in linea con l'originale.
- Niente `mix-blend-mode` nella hero: la composizione resta leggera.
- Il canvas si mette in pausa quando la hero esce dallo schermo o la scheda è in secondo piano.
- Su schermi piccoli: risoluzione del canvas 1.5x invece di 2x, meno cellule, meno corpuscoli
  e **alone fisso** (la luce resta, ma non viene ridisegnata a ogni fotogramma): 30 FPS
  nell'ambiente di test, contro i 14 che si avevano lasciandolo animato.

## Accessibilità

Con `prefers-reduced-motion: reduce` animazioni, sipario e movimento delle cellule si
fermano automaticamente. Su schermi piccoli gli effetti più pesanti sono disattivati.
