"use client";

import { useState } from "react";

type AuthResult = { error?: { message?: string } | null };

export function useAuthRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run<T extends AuthResult>(request: () => Promise<T>, fallback: string) {
    setLoading(true);
    setError("");

    try {
      const result = await request();
      if (result.error) setError(result.error.message || fallback);
      return result;
    } catch {
      setError(fallback);
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, run };
}
