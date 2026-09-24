"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SettingsPanel() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const router = useRouter();
  async function reset() {
    if (!window.confirm("Clear all your saved feedback and restart your recommendations?")) return;
    setBusy(true);
    const response = await fetch("/api/feedback", { method: "DELETE" });
    setBusy(false);
    setNotice(response.ok ? "Your recommendation signals have been reset." : "Couldn’t reset your signals.");
    if (response.ok) router.refresh();
  }
  return <div className="reset-row"><div><strong>Start fresh</strong><span>Remove your feedback and rebuild recommendations from scratch.</span>{notice && <small role="status">{notice}</small>}</div><button className="reset-button" disabled={busy} onClick={reset}>{busy ? "Resetting…" : "Reset preferences"}</button></div>;
}
