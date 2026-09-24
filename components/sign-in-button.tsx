"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  const [loading, setLoading] = useState(false);
  async function signIn() {
    setLoading(true);
    await authClient.signIn.social({ provider: "google", callbackURL: window.location.href });
    setLoading(false);
  }
  return <button className="sign-in" onClick={signIn} disabled={loading}>{loading ? "Opening Google…" : "Sign in with Google"}</button>;
}
