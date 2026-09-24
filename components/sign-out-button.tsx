"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useAuthRequest } from "@/components/use-auth-request";

export function SignOutButton() {
  const router = useRouter();
  const { loading, error, run } = useAuthRequest();

  async function signOut() {
    const result = await run(() => authClient.signOut(), "Could not sign out. Please try again.");
    if (result && !result.error) {
      router.replace("/");
      router.refresh();
    }
  }

  return <span className="sign-out-wrap">
    <button className="sign-out" onClick={signOut} disabled={loading}>
      {loading ? "Signing out…" : "Sign out"}
    </button>
    {error && <span className="auth-error" role="alert">{error}</span>}
  </span>;
}
