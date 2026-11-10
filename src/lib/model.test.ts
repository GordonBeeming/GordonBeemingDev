import { describe, expect, it } from "vitest";
import { parseRepo, toProject } from "./blog";
import {
  buildPageModel,
  formatBuildDate,
  freshnessOf,
  plural,
  pushedAgo,
  tierOf,
} from "./model";
import type { Project, RepoStats, RepoStatsMap } from "./schema";

const NOW = new Date("2026-11-10T02:00:00Z");

function project(over: Partial<Project> & { slug: string }): Project {
  return {
    title: over.slug,
    description: "d",
    techStack: [],
    repo: null,
    githubUrl: null,
    siteUrl: null,
    appStoreUrl: null,
    status: null,
    featured: false,
    date: "2026-01-01",
    ...over,
  };
}

function stat(over: Partial<RepoStats> = {}): RepoStats {
  return {
    stars: 0,
    forks: 0,
    openIssues: 0,
    pushedAt: "2026-11-10T00:00:00Z",
    language: null,
    latestRelease: null,
    ...over,
  };
}

function repoProject(slug: string, extra: Partial<Project> = {}): Project {
  return project({
    slug,
    repo: `o/${slug}`,
    githubUrl: `https://github.com/o/${slug}`,
    ...extra,
  });
}

function map(entries: Record<string, RepoStats>): RepoStatsMap {
  return new Map(Object.entries(entries));
}

describe("tierOf", () => {
  it("maps status to tier", () => {
    expect(tierOf(null)).toBe(0);
    expect(tierOf("Private preview")).toBe(1);
    expect(tierOf(" Deprecated ")).toBe(2);
    expect(tierOf("DEPRECATED")).toBe(2);
  });
});

describe("pushedAgo / freshnessOf boundaries", () => {
  it.each([
    [-3, "today"],
    [0, "today"],
    [1, "1d ago"],
    [29, "29d ago"],
    [30, "1mo ago"],
    [364, "12mo ago"],
    [365, "1y ago"],
    [800, "2y ago"],
  ])("pushedAgo(%i) = %s", (days, label) => {
    expect(pushedAgo(days)).toBe(label);
  });

  it.each([
    [0, "active"],
    [30, "active"],
    [31, "steady"],
    [180, "steady"],
    [181, "quiet"],
  ] as const)("freshnessOf(%i) = %s", (days, f) => {
    expect(freshnessOf(days)).toBe(f);
  });
});

describe("plural", () => {
  it("pluralises", () => {
    expect(plural(1, "fork")).toBe("1 fork");
    expect(plural(0, "fork")).toBe("0 forks");
    expect(plural(1, "open issue")).toBe("1 open issue");
    expect(plural(11, "open issue")).toBe("11 open issues");
  });
});

describe("formatBuildDate", () => {
  it("uses the Brisbane date across the UTC boundary", () => {
    // 15:00 UTC on the 9th is already 01:00 on the 10th in Brisbane.
    expect(formatBuildDate(new Date("2026-11-09T15:00:00Z"))).toBe("10 Nov 2026 AEST");
    expect(formatBuildDate(new Date("2026-11-09T13:59:00Z"))).toBe("9 Nov 2026 AEST");
  });
});

describe("parseRepo", () => {
  it("parses github.com repo URLs", () => {
    expect(parseRepo("https://github.com/GordonBeeming/copilot_here")).toBe("GordonBeeming/copilot_here");
    expect(parseRepo("https://github.com/o/n/tree/main")).toBe("o/n");
  });
  it("rejects other hosts, look-alikes and short paths", () => {
    expect(parseRepo("https://gitlab.com/o/n")).toBeNull();
    expect(parseRepo("https://github.com.evil.example/o/n")).toBeNull();
    expect(parseRepo("https://github.com/o")).toBeNull();
    expect(parseRepo("https://github.com/")).toBeNull();
    expect(parseRepo(null)).toBeNull();
  });
});

describe("toProject", () => {
  const base = {
    title: "T",
    description: "D",
    techStack: [],
    date: "2026-01-01",
  };
  it("strips markdown backticks from the description", () => {
    const p = toProject("t", { ...base, description: "pass `--no-ai` for text" });
    expect(p.description).toBe("pass --no-ai for text");
  });
  it("drops a site URL equal to the github URL and trims status", () => {
    const p = toProject("t", {
      ...base,
      github: "https://github.com/o/n",
      href: "https://github.com/o/n",
      status: "   ",
      featured: null,
    });
    expect(p.siteUrl).toBeNull();
    expect(p.status).toBeNull();
    expect(p.featured).toBe(false);
    expect(p.repo).toBe("o/n");
  });
  it("keeps a distinct site and trims a real status", () => {
    const p = toProject("t", { ...base, href: "https://x.dev", status: " Beta ", appStore: "https://apps.apple.com/x" });
    expect(p.siteUrl).toBe("https://x.dev");
    expect(p.status).toBe("Beta");
    expect(p.appStoreUrl).toBe("https://apps.apple.com/x");
    expect(p.githubUrl).toBeNull();
  });
});

describe("buildPageModel", () => {
  const projects = [
    repoProject("alpha", { title: "Alpha", techStack: ["Rust", "Docker"] }),
    repoProject("beta", { title: "Beta", techStack: ["Rust", "macOS"], status: "Private preview" }),
    repoProject("gamma", { title: "Gamma", techStack: ["Docker", "Rust"], status: "Deprecated" }),
    project({ slug: "delta", title: "Delta", techStack: ["Docker"], appStoreUrl: "https://apps.apple.com/d", siteUrl: "https://d.dev" }),
    repoProject("eps", { title: "Eps" }),
  ];
  const stats = map({
    "o/alpha": stat({ stars: 10, forks: 1, openIssues: 1, language: { name: "Rust", color: "#dea584" }, latestRelease: "v1" }),
    "o/beta": stat({ stars: 50, pushedAt: "2026-06-01T00:00:00Z", language: { name: "Swift", color: "#F05138" } }),
    "o/gamma": stat({ stars: 99, pushedAt: "2024-01-01T00:00:00Z", language: { name: "Rust", color: "#dea584" } }),
  });
  const model = buildPageModel(projects, stats, NOW);

  it("sorts by tier, stars (missing = 0), then title", () => {
    expect(model.projects.map((p) => p.slug)).toEqual(["alpha", "delta", "eps", "beta", "gamma"]);
  });

  it("builds stats only when readable, with labels", () => {
    const alpha = model.projects.find((p) => p.slug === "alpha")?.stats;
    expect(alpha).toMatchObject({ forksLabel: "1 fork", issuesLabel: "1 open issue", release: "v1", pushedAgo: "today", freshness: "active" });
    expect(model.projects.find((p) => p.slug === "eps")?.stats).toBeNull();
    expect(model.projects.find((p) => p.slug === "beta")?.stats?.release).toBe("no releases");
  });

  it("orders links and keeps Source when stats failed", () => {
    expect(model.projects.find((p) => p.slug === "delta")?.links.map((l) => l.label)).toEqual([
      "On the blog",
      "Site",
      "App Store",
    ]);
    expect(model.projects.find((p) => p.slug === "eps")?.links.map((l) => l.label)).toEqual(["On the blog", "Source"]);
    expect(model.projects.find((p) => p.slug === "alpha")?.links[0]).toEqual({
      label: "On the blog",
      href: "https://gordonbeeming.com/projects/alpha",
    });
  });

  it("computes tiles", () => {
    expect(model.tiles).toEqual([
      { value: "5", label: "projects" },
      { value: "159", label: "GitHub stars" },
      { value: "1", label: "pushed in the last 30 days" },
      { value: "2", label: "primary languages" },
    ]);
  });

  it("counts languages with colours", () => {
    expect(model.languages).toEqual([
      { name: "Rust", color: "#dea584", count: 2 },
      { name: "Swift", color: "#F05138", count: 1 },
    ]);
  });

  it("filters tech tags used by 2+ projects", () => {
    expect(model.techFilters).toEqual([
      { label: "Docker", count: 3 },
      { label: "Rust", count: 3 },
    ]);
  });

  it("caps and orders latestPushes", () => {
    const many = Array.from({ length: 8 }, (_, i) => repoProject(`p${i}`));
    const s = map(
      Object.fromEntries(
        many.map((p, i) => [`o/${p.slug}`, stat({ pushedAt: `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z`, stars: i })]),
      ),
    );
    const m = buildPageModel(many, s, NOW);
    expect(m.latestPushes).toHaveLength(6);
    expect(m.latestPushes[0]?.title).toBe("p7");
    expect(model.latestPushes.map((p) => p.title)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(model.latestPushes[0]?.release).toBe("v1");
    expect(model.latestPushes[1]?.release).toBe("");
  });

  it("caps techFilters at 9", () => {
    const tags = Array.from({ length: 12 }, (_, i) => `t${String(i).padStart(2, "0")}`);
    const ps = [project({ slug: "a", techStack: tags }), project({ slug: "b", techStack: tags })];
    expect(buildPageModel(ps, new Map(), NOW).techFilters).toHaveLength(9);
  });

  it("auto-updates when a new project with a new language and tags is added", () => {
    const extra = [
      ...projects,
      repoProject("zig1", { title: "Zig1", techStack: ["Zig", "WASM"] }),
      repoProject("zig2", { title: "Zig2", techStack: ["Zig", "WASM"] }),
    ];
    const s = new Map(stats);
    s.set("o/zig1", stat({ stars: 5, language: { name: "Zig", color: "#ec915c" } }));
    const m = buildPageModel(extra, s, NOW);
    expect(m.tiles[0]?.value).toBe("7");
    expect(m.tiles[1]?.value).toBe("164");
    expect(m.tiles[3]?.value).toBe("3");
    expect(m.languages.map((l) => l.name)).toContain("Zig");
    expect(m.techFilters.map((t) => t.label)).toEqual(expect.arrayContaining(["Zig", "WASM"]));
  });
});
