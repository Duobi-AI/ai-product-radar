import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsPanel } from "@/components/settings-panel";
import { getUserLearningSummary } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const summary = await getUserLearningSummary(user.id);
  return <main className="settings-page"><header className="topbar"><a className="brand" href="/"><span className="brand-mark">✳</span> AI Product Radar</a><Link className="nav-link" href="/">← Discover</Link><span className="user-chip"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>{user.name}</span></header><section className="settings-content"><div className="eyebrow muted">PERSONALIZATION</div><h1>Your signals</h1><p className="settings-intro">Small feedback signals help the radar surface more of what you like. Your choices never affect the public feed.</p><div className="settings-stats"><div><strong>{summary.total}</strong><span>total signals</span></div><div><strong>{summary.positive}</strong><span>more like this</span></div><div><strong>{summary.negative}</strong><span>less like this</span></div></div><section className="learning-card"><h2>What you’re leaning toward</h2>{summary.byCategory.length ? <div className="learning-list">{summary.byCategory.map((item) => <div key={item.name}><span>{item.name}</span><b>{item.score} signal{item.score === 1 ? "" : "s"}</b></div>)}</div> : <p>Your category preferences will show up here as you give feedback.</p>}</section><SettingsPanel /></section></main>;
}
