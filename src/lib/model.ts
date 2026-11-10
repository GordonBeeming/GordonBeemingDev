import type {
  Freshness,
  PageModel,
  Project,
  ProjectCardModel,
  RepoStats,
  RepoStatsMap,
} from "./schema";

const DAY_MS = 86_400_000;
const BLOG_PROJECTS_URL = "https://gordonbeeming.com/projects";

export function tierOf(status: string | null): 0 | 1 | 2 {
  const s = status?.trim().toLowerCase();
  if (!s) return 0;
  return s === "deprecated" ? 2 : 1;
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Whole days between two instants; negative when `pushedAt` is in the future. */
export function daysSince(pushedAt: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(pushedAt).getTime()) / DAY_MS);
}

export function pushedAgo(days: number): string {
  if (days <= 0) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

export function freshnessOf(days: number): Freshness {
  if (days <= 30) return "active";
  if (days <= 180) return "steady";
  return "quiet";
}

export function formatBuildDate(now: Date): string {
  // Brisbane has no DST, so the literal suffix is right all year.
  const formatted = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(now);
  const part = (type: string): string => formatted.find((p) => p.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")} AEST`;
}

function statsFor(project: Project, stats: RepoStatsMap): RepoStats | null {
  if (!project.repo) return null;
  return stats.get(project.repo.toLowerCase()) ?? null;
}

function buildCard(project: Project, repoStats: RepoStats | null, now: Date): ProjectCardModel {
  const links: ProjectCardModel["links"] = [
    { label: "On the blog", href: `${BLOG_PROJECTS_URL}/${project.slug}` },
  ];
  // Stats readable implies a repo URL, so the githubUrl alone decides; the link
  // stays when the stats fetch dropped this repo.
  if (project.githubUrl) {
    links.push({ label: "Source", href: project.githubUrl });
  }
  if (project.siteUrl) links.push({ label: "Site", href: project.siteUrl });
  if (project.appStoreUrl) links.push({ label: "App Store", href: project.appStoreUrl });

  let card: ProjectCardModel["stats"] = null;
  if (repoStats) {
    const days = daysSince(repoStats.pushedAt, now);
    card = {
      stars: repoStats.stars,
      forksLabel: plural(repoStats.forks, "fork"),
      issuesLabel: plural(repoStats.openIssues, "open issue"),
      pushedAt: repoStats.pushedAt,
      pushedAgo: pushedAgo(days),
      freshness: freshnessOf(days),
      language: repoStats.language,
      release: repoStats.latestRelease ?? "no releases",
    };
  }

  return {
    slug: project.slug,
    title: project.title,
    description: project.description,
    techStack: project.techStack,
    featured: project.featured,
    tier: tierOf(project.status),
    status: project.status,
    date: project.date,
    githubUrl: project.githubUrl,
    links,
    stats: card,
  };
}

function countBy<T>(items: Iterable<T>, key: (item: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

const byCountThenName = (a: [string, number], b: [string, number]): number =>
  b[1] - a[1] || a[0].localeCompare(b[0]);

export function buildPageModel(
  projects: readonly Project[],
  stats: RepoStatsMap,
  now: Date,
): PageModel {
  const cards = projects.map((p) => buildCard(p, statsFor(p, stats), now));

  const sorted = [...cards].sort(
    (a, b) =>
      a.tier - b.tier ||
      (b.stats?.stars ?? 0) - (a.stats?.stars ?? 0) ||
      a.title.localeCompare(b.title),
  );

  const withStats = cards.flatMap((c) => (c.stats ? [{ card: c, stats: c.stats }] : []));
  const totalStars = withStats.reduce((sum, x) => sum + x.stats.stars, 0);
  const activeCount = withStats.filter((x) => x.stats.freshness === "active").length;
  const languageCounts = countBy(withStats, (x) => x.stats.language?.name ?? null);

  const languageColors = new Map<string, string>();
  for (const x of withStats) {
    if (x.stats.language && !languageColors.has(x.stats.language.name)) {
      languageColors.set(x.stats.language.name, x.stats.language.color);
    }
  }

  const latestPushes = [...withStats]
    .sort(
      (a, b) =>
        Date.parse(b.stats.pushedAt) - Date.parse(a.stats.pushedAt) ||
        b.stats.stars - a.stats.stars,
    )
    .slice(0, 6)
    .map(({ card, stats: s }) => ({
      title: card.title,
      release: s.release === "no releases" ? "" : s.release,
      pushedAgo: s.pushedAgo,
      freshness: s.freshness,
    }));

  const languages = [...languageCounts]
    .sort(byCountThenName)
    .map(([name, count]) => ({ name, color: languageColors.get(name) ?? "", count }));

  const techFilters = [...countBy(projects.flatMap((p) => [...new Set(p.techStack)]), (t) => t)]
    .filter(([, count]) => count >= 2)
    .sort(byCountThenName)
    .slice(0, 9)
    .map(([label, count]) => ({ label, count }));

  return {
    tiles: [
      { value: String(projects.length), label: "projects" },
      { value: String(totalStars), label: "GitHub stars" },
      { value: String(activeCount), label: "pushed in the last 30 days" },
      { value: String(languageCounts.size), label: "primary languages" },
    ],
    latestPushes,
    languages,
    techFilters,
    projects: sorted,
    buildDate: formatBuildDate(now),
  };
}
