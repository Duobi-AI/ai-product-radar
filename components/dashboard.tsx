"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import type { ProductListing } from "@/lib/domain";
import { ProductCard } from "@/components/product-card";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { archiveHref, type ArchiveFilters } from "@/lib/archive-filters";
import { SOURCE_NAMES, type SourceKey } from "@/lib/domain";

type Feed = { items: ProductListing[]; total: number; categories: string[]; page: number; pageSize: number; ready: boolean; rankingNotice?: string };

export function Dashboard({ feed, signedIn, userName, filters }: { feed: Feed; signedIn: boolean; userName?: string; filters: ArchiveFilters }) {
  const router = useRouter();
  const [query, setQuery] = useState(filters.query);
  const [category, setCategory] = useState(filters.category || "All categories");
  const [date, setDate] = useState(filters.date);
  const [source, setSource] = useState<SourceKey | "">(filters.source);
  const [sort, setSort] = useState<"newest" | "oldest">(filters.sort);
  const [recommended, setRecommended] = useState(filters.recommended);
  const archive = filters.archive;
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const activeArchiveFilters = [
    filters.query && `Search: ${filters.query}`,
    filters.category && `Category: ${filters.category}`,
    filters.date && `Date: ${filters.date}`,
    filters.source && `Source: ${SOURCE_NAMES[filters.source]}`,
    filters.sort === "oldest" && "Oldest discovered first",
    filters.recommended && "For you",
  ].filter(Boolean).join(" · ");

  function search(event: React.FormEvent) {
    event.preventDefault();
    router.push(archiveHref({ ...filters, query: query.trim(), category, date, source, sort: recommended ? "newest" : sort, recommended,
      archive: archive || Boolean(query.trim() || date || source || sort === "oldest") }));
  }

  function pageHref(nextPage: number) {
    return archiveHref(filters, nextPage);
  }

  async function refresh() {
    setRefreshing(true); setNotice("");
    const response = await fetch("/api/admin/ingest", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setRefreshing(false);
    setNotice(response.ok ? `Collected ${result.candidates ?? 0} source mentions.` : result.error || "Could not refresh the feed.");
    if (response.ok) router.refresh();
  }

  return <>
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">✳</span> AI Product Radar</Link><nav><Link className="nav-link active" href="/">Discover</Link>{signedIn && <Link className="nav-link" href="/settings">Your signals</Link>}</nav><div className="topbar-end">{signedIn ? <div className="account-actions"><span className="user-chip"><span className="avatar">{(userName || "Y").slice(0, 1).toUpperCase()}</span><span>{userName || "Your feed"}</span></span><SignOutButton /></div> : <Link className="sign-in" href="/sign-in">Sign in</Link>}</div><ThemeToggle /></header>
    <main className="page-shell">
      <section className="hero"><div className="eyebrow"><span className="pulse" /> DAILY SCOUTING BRIEF</div><h1>What’s new in <em>AI</em></h1><p className="hero-copy">Early products, fresh launches, and open-source experiments worth a closer look.</p><div className="hero-foot"><span><b>{feed.total}</b> {archive ? "discoveries in the archive" : "products featured today · max 30"}</span><span className="updated-label">Updated daily · 12:00 PM Pacific</span></div></section>
      <section className="feed-section">
        <div className="section-heading"><div><div className="eyebrow muted">{archive ? "THE ARCHIVE" : "THE RADAR"}</div><h2>{archive ? "All discoveries" : "Today’s shortlist"}</h2></div><div className="feed-tools"><a className="refresh-button" href={archive ? "/" : "/?archive=1"}>{archive ? "Daily brief" : "Full archive →"}</a>{signedIn && <button className="refresh-button" onClick={refresh} disabled={refreshing}>{refreshing ? "Scouting…" : "↻  Refresh now"}</button>}<span className="result-count">{feed.total} results</span></div></div>
        <form className="filter-bar" onSubmit={search}><label className="search-field"><Search size={17} /><input placeholder="Search products, ideas, or keywords" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>↵</kbd></label><label className="select-field"><SlidersHorizontal size={15} /><select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{feed.categories.map((item) => <option key={item}>{item}</option>)}</select></label><input className="date-field" type="date" aria-label="Filter by date" value={date} onChange={(event) => setDate(event.target.value)} />{archive && <><label className="select-field archive-select">Source <select value={source} onChange={(event) => setSource(event.target.value as SourceKey | "")}><option value="">All sources</option>{Object.entries(SOURCE_NAMES).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></label><label className="select-field archive-select">Sort <select value={sort} disabled={recommended && signedIn} onChange={(event) => setSort(event.target.value as "newest" | "oldest")}><option value="newest">Recently discovered</option><option value="oldest">Oldest discovered</option></select></label></>}<button className="filter-submit" type="submit">Apply</button>{signedIn && <label className="recommend-toggle"><input type="checkbox" checked={recommended} onChange={(event) => { setRecommended(event.target.checked); if (event.target.checked) setSort("newest"); }} /> For you</label>}</form>
        {archive && activeArchiveFilters && <div className="active-filters"><span>{activeArchiveFilters}</span><Link href="/?archive=1">Clear filters</Link></div>}
        {notice && <p className="notice" role="status">{notice}</p>}
        {feed.rankingNotice && <p className="notice" role="status">{feed.rankingNotice}</p>}
        {!feed.ready ? <div className="empty-state setup-state"><div className="empty-icon">✳</div><h3>Your radar is almost ready</h3><p>Connect the database and source credentials to start collecting launches. The feed will populate automatically every day.</p><span className="setup-pill">Setup required</span></div> : feed.items.length ? <div className="product-grid">{feed.items.map((product) => <ProductCard key={product.id} product={product} signedIn={signedIn} filteredSource={archive ? filters.source : ""} />)}</div> : <div className="empty-state"><div className="empty-icon">⌕</div><h3>No discoveries match this view</h3><p>Try a different search or category, or check back after the next daily collection.</p></div>}
        {feed.total > feed.pageSize && <div className="pagination"><span>Showing {Math.min(feed.total, (feed.page - 1) * feed.pageSize + 1)}–{Math.min(feed.total, feed.page * feed.pageSize)} of {feed.total}</span><div>{feed.page > 1 && <a href={pageHref(feed.page - 1)}>← Previous</a>}{feed.page * feed.pageSize < feed.total && <a href={pageHref(feed.page + 1)}>Next →</a>}</div></div>}
      </section>
      <footer className="page-footer"><span>Built for curiosity, not noise.</span><span>Product Hunt · Show HN · GitHub · Hugging Face</span></footer>
    </main>
  </>;
}
