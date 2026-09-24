const CATEGORY_RULES: [string, RegExp][] = [
  ["Developer Tools", /\b(code|coding|developer|devtool|api|agent|mcp|cli)\b/i],
  ["Creative", /\b(video|image|music|design|art|voice|audio|animation)\b/i],
  ["Productivity", /\b(assistant|meeting|notes|email|writing|search|workflow)\b/i],
  ["Research", /\b(model|dataset|research|paper|benchmark|inference)\b/i],
  ["Robotics", /\b(robot|robotics|drone|autonomous|physical)\b/i],
];

export function classifyCategory(value: string): string {
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(value)) return category;
  }
  return "AI Tools";
}

export function classifyStage(value: string): string {
  if (/\b(waitlist|coming soon|pre-launch|prelaunch)\b/i.test(value)) return "Waitlist";
  if (/\b(beta|early access|private preview)\b/i.test(value)) return "Beta";
  if (/\b(open-source|open source|github|hugging face|demo|space)\b/i.test(value)) {
    return "Open source / demo";
  }
  return "New launch";
}

export function isAiRelated(value: string): boolean {
  return /\b(ai|artificial intelligence|llm|large language model|generative|machine learning|deep learning|agentic|neural)\b/i.test(
    value,
  );
}

export function identityFor(name: string, websiteUrl?: string | null): string {
  if (websiteUrl) {
    try {
      const host = new URL(websiteUrl).hostname.toLowerCase().replace(/^www\./, "");
      const isProductHuntRedirect = host === "producthunt.com" || host.endsWith(".producthunt.com");
      if (host && !host.includes("github.com") && !host.includes("huggingface.co") && !isProductHuntRedirect) {
        return "host:" + host;
      }
    } catch {
      // Fall back to a stable, normalized name below.
    }
  }
  return "name:" + name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
