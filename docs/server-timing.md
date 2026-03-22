# Server timing debug (Vercel)

## Cache home (15 min)

La pipeline della home è in **`unstable_cache`** con TTL **900s** → stesso deploy non riesegue tutti i fetch ad ogni reload entro 15 minuti. Dettagli: `docs/home-data-cache.md`.

---

## Build vs caricamento lento (importante)

| Cosa misuri | Dove guardi | Cosa significa |
|-------------|-------------|----------------|
| **Build** (`next build`) | Tab **Building** del deploy su Vercel + righe `[build] …` in coda/fondo log | Quanto dura il **deploy** (compilazione). Non spiega il sito lento **dopo** il deploy. |
| **Prima risposta HTML / TTFB** | **Runtime logs** della Function + Network nel browser | **SSR**: fetch esterni, cold start, timeout ~10s (Hobby). Qui serve `DEBUG_PAGE_TIMING` (sotto). |
| **JS/CSS nel browser** | Network / Performance (Lighthouse) | Bundle, immagini, third-party. |

Lo script `npm run build` usa `scripts/build-with-timing.mjs` e stampa **`[build] start …`** e **`[build] next build finished in …ms`** così nei log Vercel vedi subito quanto è durata la build. Per il “carica all’infinito” online, imposta **`DEBUG_PAGE_TIMING=1`** (variabile d’ambiente su Vercel) e leggi le righe `home:…` nei **Runtime logs** della richiesta a `/`.

---

È **fatto apposta per seguire** cosa succede **dentro una singola invocazione** della serverless function che renderizza `/` (non crea una “function” Vercel per ogni step: sono **blocchi `timedAsync`** nello stesso handler).

Ogni label (`home:…`, `overlay:…`, …) è uno **step sequenziale o parallelo** misurato nel log della **stessa** Function; così nei **Runtime logs** vedi dove si accumola tempo prima del timeout ~10s (Hobby).

Formato riga: **`nomeStep millisecondi`** (es. `home:fetchMarketSnapshot 842ms`).

## Cosa compare nei log

- Senza env extra, solo gli step **≥ 10s** (`console.warn`) — tipico limite Vercel Hobby; da ottimizzare per primi.
- Con `DEBUG_PAGE_TIMING=1`, anche gli step veloci (`console.log`).

## Pagina web `/debug`

Con **`ENABLE_DEBUG_TIMING_PAGE=1`** su Vercel (o in dev senza env), la route **`/debug`** mostra una tabella con gli stessi tempi del server che alimentano anche i log (`timedAsync` + `home:totalWallTime`).  
Attenzione: ogni visita esegue **tutta** la pipeline della home (come una richiesta a `/`).

---

## Log di tutte le sezioni (anche veloci)

Imposta su Vercel (o in `.env.local`):

```bash
DEBUG_PAGE_TIMING=1
```

Poi in **Deployments → Functions → View logs** vedrai ogni step (`home:…`, `overlay:…`, `market:…`, `cpi:…`, `social:…`).

## Etichette utili

| Prefisso | Significato |
|----------|-------------|
| `home:totalWallTime` | Tempo totale della richiesta `/` (SSR). |
| `home:fetchMarketYearlyOverlay` | Overlay storico (include sotto-log `overlay:*` e `cpi:*`). |
| `home:fetchMarketSnapshot` | Sidecar prezzi + sotto-log `market:resolve*`. |
| `social:*` | Reddit / YouTube / Facebook+Jina / Threads+Jina in parallelo. |
| `cpi:fredApi` / `cpi:worldBank` / `cpi:fredGraphCsv` | Catena inflazione live. |

Implementazione: `src/lib/serverTiming.ts`.
