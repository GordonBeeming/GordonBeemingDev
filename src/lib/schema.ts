import { z } from "zod";

/**
 * One file in xylem's `content/projects`. The blog owns this shape; unknown
 * keys are ignored so a new blog-only field never breaks this build.
 */
// Links are rendered as `href`s, so anything but https (notably `javascript:`)
// in an upstream file must fail the build rather than reach the page.
const httpsUrl = z.url({ protocol: /^https$/ });

export const blogProjectSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  techStack: z.array(z.string().min(1)).default([]),
  github: httpsUrl.nullish(),
  href: httpsUrl.nullish(),
  appStore: httpsUrl.nullish(),
  status: z.string().nullish(),
  featured: z.boolean().nullish(),
  date: z.union([z.iso.date(), z.iso.datetime({ offset: true })]),
});

export type BlogProject = z.infer<typeof blogProjectSchema>;

/** A validated blog project plus the slug taken from its file name. */
export interface Project {
  slug: string;
  title: string;
  description: string;
  techStack: string[];
  /** `owner/name`, present only when `github` is a github.com repo URL. */
  repo: string | null;
  githubUrl: string | null;
  siteUrl: string | null;
  appStoreUrl: string | null;
  status: string | null;
  featured: boolean;
  /** ISO date (YYYY-MM-DD) the project was added to the blog. */
  date: string;
}

/** Live numbers for one repository. Absent when GitHub can't be read for it. */
export interface RepoStats {
  stars: number;
  forks: number;
  openIssues: number;
  /** ISO timestamp of the last push. */
  pushedAt: string;
  language: { name: string; color: string } | null;
  latestRelease: string | null;
}

/** Keyed by `owner/name`, lower-cased. */
export type RepoStatsMap = ReadonlyMap<string, RepoStats>;

export type Freshness = "active" | "steady" | "quiet";

export interface CardLink {
  label: string;
  href: string;
}

export interface ProjectCardModel {
  slug: string;
  title: string;
  description: string;
  techStack: string[];
  featured: boolean;
  /** 0 live, 1 preview (any other status), 2 deprecated. */
  tier: 0 | 1 | 2;
  status: string | null;
  date: string;
  links: CardLink[];
  /** The repository page; the star count links here. */
  githubUrl: string | null;
  /** Null when the project has no readable public repo. */
  stats: {
    stars: number;
    forksLabel: string;
    issuesLabel: string;
    pushedAt: string;
    pushedAgo: string;
    freshness: Freshness;
    language: { name: string; color: string } | null;
    /** Tag name, or "no releases". */
    release: string;
  } | null;
}

export interface PageModel {
  tiles: { value: string; label: string }[];
  latestPushes: { title: string; release: string; pushedAgo: string; freshness: Freshness }[];
  languages: { name: string; color: string; count: number }[];
  /** "All" is not included; the page adds it. */
  techFilters: { label: string; count: number }[];
  /** Default order: tier, then stars, then title. Featured and non-featured together. */
  projects: ProjectCardModel[];
  /** e.g. "10 Nov 2026 AEST" */
  buildDate: string;
}

export type SortKey = "stars" | "pushed" | "date";
