"use client";

import { ArrowDown, ArrowUpRight, ArrowUp } from "lucide-react";
import { useState } from "react";
import type { ProductListing } from "@/lib/domain";

const reasons = ["Too mature", "Not relevant", "Low quality", "Already know it"];

export function ProductCard({ product, signedIn }: { product: ProductListing; signedIn: boolean }) {
  const [direction, setDirection] = useState(product.feedback?.direction || 0);
  const [reason, setReason] = useState(product.feedback?.reason || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function vote(value: -1 | 1) {
    if (!signedIn) { setMessage("Sign in to tune your feed."); return; }
    const next = direction === value ? 0 : value;
    setBusy(true);
    const response = await fetch("/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, direction: next, reason: next < 0 ? reason : "" }),
    });
    setBusy(false);
    if (response.ok) { setDirection(next); setMessage(next ? "Preference saved" : "Feedback removed"); }
    else setMessage("Couldn’t save feedback");
  }

  return (
    <article className="product-card">
      <div className="card-topline"><span className="stage"><i />{product.stage}</span><time>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(product.announcedAt || product.firstSeenAt)}</time></div>
      <div className="product-title-row"><h2>{product.name}</h2>{product.websiteUrl && <a className="icon-link" href={product.websiteUrl} target="_blank" rel="noreferrer" aria-label={`Visit ${product.name}`}><ArrowUpRight size={17} /></a>}</div>
      <p className="product-description">{product.description || "A new AI project discovered in the community."}</p>
      <div className="card-meta"><span className="category-tag">{product.category}</span><div className="source-list">{product.sources.slice(0, 3).map((source) => <a key={source.id} href={source.sourceUrl} target="_blank" rel="noreferrer">{source.sourceName}<ArrowUpRight size={11} /></a>)}</div></div>
      <div className="card-feedback">
        <span className="feedback-label">Relevant to you?</span>
        <div className="vote-actions">
          <button aria-label="More like this" title="More like this" disabled={busy} className={direction === 1 ? "selected" : ""} onClick={() => vote(1)}><ArrowUp size={14} /> More</button>
          <button aria-label="Less like this" title="Less like this" disabled={busy} className={direction === -1 ? "selected" : ""} onClick={() => vote(-1)}><ArrowDown size={14} /> Less</button>
        </div>
        {direction === -1 && <select aria-label="Why is this not relevant?" value={reason} onChange={(event) => { setReason(event.target.value); }} onBlur={() => reason && vote(-1)}><option value="">Add a reason</option>{reasons.map((item) => <option key={item}>{item}</option>)}</select>}
        <span className="feedback-message" aria-live="polite">{message}</span>
      </div>
    </article>
  );
}
