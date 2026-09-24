import Link from "next/link";
import { SignInButton } from "@/components/sign-in-button";
import { isAuthConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const configured = isAuthConfigured();
  return <main className="auth-page"><a className="brand" href="/"><span className="brand-mark">✳</span> AI Product Radar</a><section className="auth-panel"><div className="empty-icon">✳</div><div className="eyebrow muted">YOUR PERSONAL RADAR</div><h1>Make discovery yours.</h1><p>Sign in to teach your feed what kinds of early AI products you want to see more of.</p>{configured ? <SignInButton /> : <div className="setup-callout"><strong>Sign-in setup needed</strong><span>Google OAuth credentials and the database need to be connected first.</span></div>}<Link className="back-link" href="/">← Back to the public feed</Link></section><div className="auth-caption">Your feedback stays attached to your account.</div></main>;
}
