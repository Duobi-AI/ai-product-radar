export function getCanonicalSignInUrl(
  requestHost: string | null,
  configuredBaseUrl: string | undefined,
): string | null {
  if (!requestHost || !configuredBaseUrl) return null;

  const canonicalUrl = new URL(configuredBaseUrl);
  if (requestHost.toLowerCase() === canonicalUrl.host.toLowerCase()) return null;

  return new URL("/sign-in", canonicalUrl).toString();
}
