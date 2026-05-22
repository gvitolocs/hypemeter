import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact Pokoin News for editorial feedback, advertising inquiries, card highlight corrections, source updates, and safety-related site questions.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact Us | Pokoin News",
    description:
      "Reach Pokoin News for editorial feedback, advertising inquiries, card highlight corrections, and source updates.",
    url: "/contact",
    siteName: "Pokoin News",
    images: [{ url: "/pokoin-1024.png", width: 1024, height: 1024, alt: "Pokoin" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Us | Pokoin News",
    description:
      "Contact Pokoin News for editorial feedback, advertising inquiries, card highlight corrections, and source updates.",
    images: ["/pokoin-1024.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const contactReasons = [
  {
    title: "Editorial and Site Feedback",
    body: "Send corrections, suggestions, or context about Pokemon news coverage, Pokoin ecosystem updates, and signal explanations.",
  },
  {
    title: "Advertising and Partnerships",
    body: "Use this address for sponsorship, advertising, and partnership questions related to Pokoin News placements.",
  },
  {
    title: "Card Highlight Corrections",
    body: "Report a card image, source, title, or marketplace link that looks outdated, mismatched, or unclear.",
  },
  {
    title: "Source and Safety Questions",
    body: "Share concerns about source quality, family-safe content, transparency, or reader safety.",
  },
];

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100 md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-cyan-400/35 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300 transition hover:border-cyan-300/70 hover:bg-slate-800/80"
          >
            Back to homepage
          </Link>
          <Link
            href="/about"
            className="inline-flex items-center rounded-xl border border-fuchsia-400/35 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-fuchsia-200 transition hover:border-fuchsia-300/70 hover:bg-slate-800/80"
          >
            About Us
          </Link>
        </div>

        <section className="rounded-3xl border border-white/10 bg-slate-900/75 p-6 shadow-2xl shadow-cyan-950/30 md:p-8">
          <p className="text-sm font-semibold tracking-[0.08em] text-fuchsia-300">CONTACT US</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">Reach Pokoin News</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
            Contact Pokoin News for editorial feedback, advertising inquiries, card highlight corrections, source
            updates, and safety questions. We use plain, family-safe language and review reports that help keep the
            site useful for collectors, marketplace watchers, and Pokoin readers.
          </p>

          <div className="mt-6 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Email</p>
            <a className="mt-2 block text-2xl font-black text-white hover:text-cyan-200" href="mailto:contact@pokoin.com">
              contact@pokoin.com
            </a>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Please include the page URL, card name, source link, or screenshot context when reporting a correction.
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {contactReasons.map((reason) => (
            <div key={reason.title} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
              <h2 className="text-base font-bold text-white">{reason.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{reason.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-3xl border border-amber-300/20 bg-slate-900/75 p-6">
          <h2 className="text-lg font-black text-white">Safety Reminder</h2>
          <p className="mt-3 text-sm leading-7 text-slate-200">
            Never send seed phrases, private keys, passwords, API keys, full payment details, or sensitive identity
            documents by email. Pokoin News will not ask readers to share wallet recovery secrets or credentials.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Link className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-cyan-200 hover:bg-slate-700" href="/learn/live-event-signals">
              Learn About Signals
            </Link>
            <a className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-cyan-200 hover:bg-slate-700" href="https://pokoin.com/privacy">
              Privacy Policy
            </a>
            <a className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-cyan-200 hover:bg-slate-700" href="https://pokoin.com/contact">
              Main Pokoin Contact
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
