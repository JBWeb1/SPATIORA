// Release notes shown in "What's new" after the app updates itself.
export interface Release {
  version: string;
  date: string;
  highlights: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: "1.1.0",
    date: "2026-10-10",
    highlights: [
      "Self-updating app: VISTORA now detects new releases and updates itself — no reinstall needed.",
      "Install VISTORA on your phone or desktop as an app (works offline for the app shell).",
      "Live projects: comments and concepts from collaborators appear without refreshing.",
      "Exchange rates and product prices refresh automatically in the background.",
      "New brand identity across the app, icons and shared links.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-10-10",
    highlights: [
      "AI room redesigns, 3D studio, material editor and renovation calculator.",
      "Marketplace, shopping lists, renovation planner and load-shedding & solar planner.",
      "Style DNA quiz, sharing with comments, contractor directory and Professional Workspace.",
    ],
  },
];

/** Compare dotted versions: returns >0 when a is newer than b. */
export function compareVersions(a: string, b: string) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
