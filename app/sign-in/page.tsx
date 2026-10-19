import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/sign-in-button";
import { isAuthConfigured } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { getCanonicalSignInUrl } from "@/lib/sign-in-origin";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const configured = isAuthConfigured();
  if (configured) {
    const canonicalSignInUrl = getCanonicalSignInUrl(
      (await headers()).get("host"),
      process.env.BETTER_AUTH_URL,
    );
    if (canonicalSignInUrl) redirect(canonicalSignInUrl);
  }

  if (await getCurrentUser()) redirect("/");
  return <main className="auth-page"><header className="auth-header"><Link className="brand" href="/"><span className="brand-mark">✳</span> AI Product Radar</Link><ThemeToggle /></header><section className="auth-panel"><div className="empty-icon">✳</div><div className="eyebrow muted">YOUR PERSONAL RADAR</div><h1>Make discovery yours.</h1><p>Sign in to teach your feed what kinds of early AI products you want to see more of.</p>{configured ? <SignInButton /> : <div className="setup-callout"><strong>Sign-in setup needed</strong><span>Google OAuth credentials and the database need to be connected first.</span></div>}<Link className="back-link" href="/">← Back to the public feed</Link></section><div className="auth-caption">Your feedback stays attached to your account.</div></main>;
}
