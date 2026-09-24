"use client";

import { authClient } from "@/lib/auth-client";
import { useAuthRequest } from "@/components/use-auth-request";

export function SignInButton() {
  const { loading, error, run } = useAuthRequest();

  function signIn() {
    void run(
      () => authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      }),
      "Could not start Google sign-in. Please try again.",
    );
  }

  return <>
    <button className="sign-in" onClick={signIn} disabled={loading}>
      {loading ? "Opening Google…" : "Sign in with Google"}
    </button>
    {error && <p className="auth-error" role="alert">{error}</p>}
  </>;
}
