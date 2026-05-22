const footerLinks = {
  explore: [
    { label: "About Us", href: "/about" },
    { label: "Contact Us", href: "/contact" },
    { label: "Privacy Policy", href: "https://pokoin.com/privacy" },
    { label: "Pokoin", href: "https://pokoin.com/" },
    { label: "Marketplace", href: "https://pokoin.com/marketplace" },
    { label: "PokoinScan", href: "https://pokoin.com/scan" },
    { label: "Network health", href: "https://pokoin.com/health" },
    { label: "Account", href: "https://pokoin.com/profile" },
  ],
  network: [
    { label: "RPC endpoint", href: "https://rpc.pokoin.com/rpc" },
    { label: "Reserve proof", href: "https://explorer.pokoin.com/wpkn-reserve.json" },
    {
      label: "wPKN contract",
      href: "https://bscscan.com/token/0x9B59aB6B8A1a41AD2e764C1133fD7E6D1C8727dA",
    },
    {
      label: "PancakeSwap",
      href: "https://pancakeswap.finance/swap?outputCurrency=0x9B59aB6B8A1a41AD2e764C1133fD7E6D1C8727dA",
    },
    { label: "CoinMarketCap", href: "https://coinmarketcap.com/currencies/pokoin/" },
  ],
};

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <div className="w-44">
      <h2 className="text-sm font-black tracking-wide text-white">{title}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-sm text-slate-300 transition-colors hover:text-cyan-200"
            rel="noreferrer"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

export function PokoinFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-slate-950 px-4 pb-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl rounded-[1.875rem] border border-white/10 bg-slate-950/95 px-5 py-6 shadow-2xl shadow-black/40 md:px-7 md:py-8">
        <div className="flex flex-wrap justify-between gap-7">
          <div className="max-w-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element -- shared Pokoin brand asset hosted by the main app. */}
                <img
                  src="/pokoin-1024.png"
                  alt="Pokoin"
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </div>
              <div>
                <p className="text-xl font-black tracking-tight text-white">Pokoin</p>
                <p className="text-xs text-slate-400">Permissioned PoS + collector rails</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              A production-oriented ecosystem for native PKN settlement, wrapped liquidity and premium card marketplace
              infrastructure.
            </p>
          </div>

          <FooterColumn title="Explore" links={footerLinks.explore} />
          <FooterColumn title="Network" links={footerLinks.network} />

          <div className="w-64 rounded-3xl border border-amber-300/20 bg-gradient-to-br from-teal-500/15 to-amber-300/10 p-5">
            <p className="text-2xl text-amber-300">✓</p>
            <h2 className="mt-3 text-lg font-black text-white">Public by design</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              About, contact, privacy, explorer data, RPC status, reserve proof and wPKN references stay one click away.
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <p className="text-slate-400">
              © {year} Pokoin. Card Reserve, PokoinPoS and wPKN are part of the Pokoin ecosystem.
            </p>
            <p className="font-bold text-amber-200">Built for transparent collectible commerce and on-chain settlement.</p>
            <a className="text-slate-300 hover:text-cyan-200" href="mailto:contact@pokoin.com">
              contact@pokoin.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
