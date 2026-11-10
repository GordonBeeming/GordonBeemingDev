import { afterEach, describe, expect, it, vi } from "vitest";
import { toProject } from "./blog";
import { fetchRepoStats } from "./github";
import { blogProjectSchema } from "./schema";

const base = { title: "T", description: "D", techStack: [], date: "2026-01-01" };

describe("blogProjectSchema", () => {
  it.each(["javascript:alert(1)", "http://example.com", "data:text/html,x"])("rejects the link %s", (href) => {
    expect(blogProjectSchema.safeParse({ ...base, href }).success).toBe(false);
  });
  it("accepts https links", () => {
    expect(blogProjectSchema.safeParse({ ...base, href: "https://example.com" }).success).toBe(true);
  });
  it.each(["2026-99-99", "2026-01-01garbage", "01/01/2026"])("rejects the date %s", (date) => {
    expect(blogProjectSchema.safeParse({ ...base, date }).success).toBe(false);
  });
  it("accepts a datetime and keeps only the date", () => {
    const parsed = blogProjectSchema.parse({ ...base, date: "2026-03-08T00:00:00.000Z" });
    expect(toProject("t", parsed).date).toBe("2026-03-08");
  });
});

describe("fetchRepoStats partial failures", () => {
  const node = {
    stargazerCount: 1,
    forkCount: 0,
    pushedAt: "2026-11-01T00:00:00Z",
    primaryLanguage: null,
    latestRelease: null,
    issues: { totalCount: 0 },
  };
  function respond(body: unknown): void {
    vi.stubEnv("GITHUB_TOKEN", "t");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
  }
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("drops a repo whose field failed, keeping the others", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    respond({ data: { r0: node, r1: node }, errors: [{ message: "Release service unavailable", path: ["r0", "latestRelease"] }] });
    const stats = await fetchRepoStats(["o/a", "o/b"]);
    expect([...stats.keys()]).toEqual(["o/b"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("o/a"));
  });

  it("drops a repo that has never been pushed to", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    respond({ data: { r0: { ...node, pushedAt: null }, r1: node } });
    expect([...(await fetchRepoStats(["o/a", "o/b"])).keys()]).toEqual(["o/b"]);
  });

  it("drops a repo with an unexpected shape", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    respond({ data: { r0: { stargazerCount: "many" }, r1: node } });
    expect([...(await fetchRepoStats(["o/a", "o/b"])).keys()]).toEqual(["o/b"]);
  });
});
