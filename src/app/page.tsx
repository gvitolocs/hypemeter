type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

type Indicator = {
  id: string;
  label: string;
  score: number;
  description: string;
};

type YearScore = {
  year: number;
  score: number;
};

export const revalidate = 1800;

const NEWS_URL =
  "https://news.google.com/rss/search?q=Pokemon&hl=en-US&gl=US&ceid=US:en";

const positiveKeywords = [
  "announced",
  "launch",
  "record",
  "wins",
  "surge",
  "new",
  "trailer",
  "revealed",
  "returns",
  "hype",
  "goes viral",
];

const negativeKeywords = [
  "delay",
  "lawsuit",
  "cancel",
  "backlash",
  "hack",
  "leak",
  "bug",
  "outrage",
  "scam",
  "drop",
];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readTag(itemXml: string, tag: string) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = itemXml.match(regex);
  return match ? match[1].trim() : "";
}

function decodeHtml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function extractSourceFromTitle(title: string) {
  const chunks = title.split(" - ");
  if (chunks.length < 2) {
    return "Unknown Source";
  }
  return chunks[chunks.length - 1].trim();
}

function parseNews(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match = itemRegex.exec(xml);

  while (match) {
    const block = match[1];
    const title = decodeHtml(readTag(block, "title"));
    const link = decodeHtml(readTag(block, "link"));
    const pubDate = decodeHtml(readTag(block, "pubDate"));
    const sourceTag = decodeHtml(readTag(block, "source"));
    const source = sourceTag || extractSourceFromTitle(title);

    if (title && link) {
      items.push({ title, link, pubDate, source });
    }
    match = itemRegex.exec(xml);
  }
  return items.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );
}

function hoursAgo(dateString: string) {
  const timestamp = new Date(dateString).getTime();
  if (Number.isNaN(timestamp)) {
    return 999;
  }
  return (Date.now() - timestamp) / (1000 * 60 * 60);
}

function summarizeHype(items: NewsItem[]) {
  const recent24 = items.filter((item) => hoursAgo(item.pubDate) <= 24).length;
  const rapid6 = items.filter((item) => hoursAgo(item.pubDate) <= 6).length;
  const rapid2 = items.filter((item) => hoursAgo(item.pubDate) <= 2).length;

  const textBlob = items.map((item) => item.title.toLowerCase()).join(" | ");
  const positiveHits = positiveKeywords.reduce(
    (count, keyword) => count + (textBlob.includes(keyword) ? 1 : 0),
    0,
  );
  const negativeHits = negativeKeywords.reduce(
    (count, keyword) => count + (textBlob.includes(keyword) ? 1 : 0),
    0,
  );

  const indicators: Indicator[] = [
    {
      id: "momentum",
      label: "News Momentum",
      score: clampScore((recent24 / 12) * 100),
      description: "How many fresh Pokemon stories dropped in 24h.",
    },
    {
      id: "velocity",
      label: "Viral Velocity",
      score: clampScore((rapid6 / 6) * 100),
      description: "Spike of stories in the latest 6 hours.",
    },
    {
      id: "flash",
      label: "Flash Surge",
      score: clampScore((rapid2 / 4) * 100),
      description: "Ultra-fresh news burst in the latest 2 hours.",
    },
    {
      id: "positive",
      label: "W Signal",
      score: clampScore((positiveHits / 8) * 100),
      description: "Positive keywords in headlines (launches, reveals, wins).",
    },
    {
      id: "stability",
      label: "Drama Shield",
      score: clampScore(100 - (negativeHits / 8) * 100),
      description: "Fewer negative headlines means more stable hype.",
    },
    {
      id: "diversity",
      label: "Source Spread",
      score: clampScore((new Set(items.map((i) => i.source)).size / 12) * 100),
      description: "How many outlets are covering Pokemon right now.",
    },
    {
      id: "depth",
      label: "Feed Depth",
      score: clampScore((items.length / 20) * 100),
      description: "Total number of Pokémon stories in the live feed.",
    },
  ];

  const score = clampScore(
    indicators.reduce((sum, indicator) => sum + indicator.score, 0) /
      indicators.length,
  );
  return { score, indicators };
}

function labelForScore(score: number) {
  if (score >= 85) return { label: "MEGA HYPE", vibe: "Absolute chaos mode." };
  if (score >= 70) return { label: "PEAKING", vibe: "Pokemon is cooking hard." };
  if (score >= 55) return { label: "HOT", vibe: "Momentum is very real." };
  if (score >= 40) return { label: "WARM", vibe: "Buzz is steady, not wild." };
  if (score >= 25) return { label: "CHILL", vibe: "Calm cycle, waiting for reveals." };
  return { label: "SLEEP MODE", vibe: "Need a trailer drop ASAP." };
}

function meterColor(score: number) {
  if (score >= 70) return "from-fuchsia-500 via-red-500 to-orange-400";
  if (score >= 40) return "from-cyan-400 via-blue-500 to-purple-500";
  return "from-slate-400 via-slate-500 to-slate-700";
}

function buildBacktrackSeries(liveScore: number): YearScore[] {
  const currentYear = new Date().getFullYear();
  const baselines: Record<number, number> = {
    2005: 43,
    2006: 61,
    2007: 55,
    2008: 49,
    2009: 52,
    2010: 68,
    2011: 59,
    2012: 57,
    2013: 50,
    2014: 54,
    2015: 58,
    2016: 96,
    2017: 75,
    2018: 66,
    2019: 70,
    2020: 73,
    2021: 79,
    2022: 72,
    2023: 76,
    2024: 82,
    2025: 69,
  };

  const data: YearScore[] = [];
  for (let year = 2005; year <= currentYear; year += 1) {
    const baseline = baselines[year] ?? baselines[2025];
    data.push({ year, score: clampScore(baseline) });
  }

  if (data.length > 0) {
    const last = data[data.length - 1];
    last.score = clampScore(last.score * 0.45 + liveScore * 0.55);
  }
  return data;
}

function computeChartPoints(series: YearScore[], width: number, height: number) {
  const padX = 20;
  const padY = 18;
  const safeWidth = width - padX * 2;
  const safeHeight = height - padY * 2;

  return series.map((entry, idx) => {
    const x = padX + (idx / Math.max(series.length - 1, 1)) * safeWidth;
    const y = padY + ((100 - entry.score) / 100) * safeHeight;
    return { ...entry, x, y };
  });
}

export default async function Home() {
  let items: NewsItem[] = [];
  try {
    const response = await fetch(NEWS_URL, {
      next: { revalidate },
      headers: {
        "user-agent": "Mozilla/5.0 hypemeter",
      },
    });
    if (response.ok) {
      const xml = await response.text();
      items = parseNews(xml).slice(0, 20);
    }
  } catch {
    items = [];
  }

  const { score, indicators } = summarizeHype(items);
  const mood = labelForScore(score);
  const history = buildBacktrackSeries(score);
  const chartWidth = 940;
  const chartHeight = 250;
  const points = computeChartPoints(history, chartWidth, chartHeight);
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  const updatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
            Pokemon Fear & Greed Remix
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">
            Pokemon Hype Meter
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
            A real-time snapshot of Pokemon buzz, built from live headlines and
            trend signals.
          </p>
          <p className="mt-2 text-xs text-slate-400">Updated: {updatedAt}</p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900 p-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                  Current Hype
                </p>
                <h2 className="mt-1 text-4xl font-black md:text-6xl">
                  {score}
                  <span className="text-2xl text-slate-400">/100</span>
                </h2>
                <p className="mt-1 text-lg font-semibold text-fuchsia-300">
                  {mood.label}
                </p>
                <p className="text-sm text-slate-400">{mood.vibe}</p>
              </div>
              <div className="relative h-40 w-40 rounded-full p-3 ring-1 ring-white/20">
                <div
                  className="h-full w-full rounded-full"
                  style={{
                    background: `conic-gradient(#22d3ee ${score * 3.6}deg, #334155 0deg)`,
                  }}
                />
                <div className="absolute inset-8 flex items-center justify-center rounded-full bg-slate-900 text-2xl font-black">
                  {score}
                </div>
              </div>
            </div>
            <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-700">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${meterColor(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
              How this meter works
            </h3>
            <p className="mt-3 text-sm text-slate-400">
              Similar to Fear & Greed, this score blends seven equally weighted
              indicators from a live Pokemon news feed.
            </p>
            <a
              className="mt-4 inline-block text-sm font-semibold text-cyan-300 hover:text-cyan-200"
              href="https://edition.cnn.com/markets/fear-and-greed"
              target="_blank"
              rel="noreferrer"
            >
              Inspiration: CNN Fear & Greed →
            </a>
            <p className="mt-4 text-xs text-slate-500">
              Model note: historical values are a backtracking estimate from key
              yearly Pokemon cycle intensity and are blended with today&apos;s
              live score.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
              Hype Backtracking (2005 → now)
            </h3>
            <p className="text-xs text-slate-400">
              First year: {history[0]?.year} • Latest:{" "}
              {history[history.length - 1]?.year}
            </p>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 p-3">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full">
              {[20, 40, 60, 80].map((tick) => {
                const y = 18 + ((100 - tick) / 100) * (chartHeight - 36);
                return (
                  <line
                    key={tick}
                    x1="20"
                    x2={chartWidth - 20}
                    y1={y}
                    y2={y}
                    stroke="rgba(148, 163, 184, 0.2)"
                    strokeDasharray="4 4"
                  />
                );
              })}
              <polyline
                fill="none"
                stroke="rgba(34, 211, 238, 0.9)"
                strokeWidth="4"
                points={polyline}
              />
              {points.map((point) => (
                <circle
                  key={point.year}
                  cx={point.x}
                  cy={point.y}
                  r={point.year % 5 === 0 ? 4.5 : 3}
                  fill={point.year === history[history.length - 1].year ? "#f472b6" : "#22d3ee"}
                />
              ))}
            </svg>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>{history[0]?.year}</span>
              <span>{history[Math.floor(history.length / 4)]?.year}</span>
              <span>{history[Math.floor(history.length / 2)]?.year}</span>
              <span>{history[Math.floor((history.length * 3) / 4)]?.year}</span>
              <span>{history[history.length - 1]?.year}</span>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
            7 Hype Signals
          </h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {indicators.map((indicator) => (
              <article
                key={indicator.id}
                className="rounded-2xl border border-white/10 bg-slate-800 p-4"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  {indicator.label}
                </p>
                <p className="mt-1 text-2xl font-bold text-white">
                  {indicator.score}
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500"
                    style={{ width: `${indicator.score}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {indicator.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
            Latest Pokemon News
          </h3>
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              News feed temporarily unavailable. Deploy and refresh in a minute.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {items.slice(0, 12).map((item) => (
                <li
                  key={`${item.link}-${item.pubDate}`}
                  className="rounded-2xl border border-white/10 bg-slate-800 p-4"
                >
                  <a
                    className="text-sm font-semibold text-cyan-300 hover:text-cyan-200"
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.title}
                  </a>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.source} •{" "}
                    {new Date(item.pubDate).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
