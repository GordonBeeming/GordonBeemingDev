import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProjects } from "./blog";
import { fetchRepoStats } from "./github";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const validFile = { title: "T", description: "D", techStack: ["Rust"], date: "2026-01-01", github: "https://github.com/o/n" };

function listing(...names: string[]): Response {
  return json(names.map((name) => ({ name, type: "file", download_url: `https://raw.test/${name}` })));
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("fetchProjects", () => {
  it("maps files to projects and sends a generic UA plus the token", async () => {
    vi.stubEnv("GITHUB_TOKEN", "tok");
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => (url.includes("api.github.com") ? listing("a.json", "README.md") : json(validFile)));
    vi.stubGlobal("fetch", fetchMock);
    const projects = await fetchProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ slug: "a", repo: "o/n" });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("User-Agent")).toBe("projects-site-build");
    expect(headers.get("Authorization")).toBe("Bearer tok");
  });

  it("throws when the listing fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "nope" }, 403)));
    await expect(fetchProjects()).rejects.toThrow(/project listing: HTTP 403/);
  });

  it("throws naming the file when JSON is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("api.github.com") ? listing("bad.json") : new Response("{not json"))),
    );
    await expect(fetchProjects()).rejects.toThrow(/bad\.json: invalid JSON/);
  });

  it("throws naming the file when validation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("api.github.com") ? listing("odd.json") : json({ title: "" }))),
    );
    await expect(fetchProjects()).rejects.toThrow(/odd\.json: failed validation/);
  });

  it("throws naming the file when a file fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("api.github.com") ? listing("gone.json") : json({}, 404))),
    );
    await expect(fetchProjects()).rejects.toThrow(/gone\.json: HTTP 404/);
  });
});

describe("fetchRepoStats", () => {
  const node = {
    stargazerCount: 3,
    forkCount: 1,
    pushedAt: "2026-11-01T00:00:00Z",
    primaryLanguage: { name: "Rust", color: null },
    latestRelease: null,
    issues: { totalCount: 2 },
  };

  it("throws without a token when CI is set", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("CI", "true");
    await expect(fetchRepoStats(["o/n"])).rejects.toThrow(/GITHUB_TOKEN/);
  });

  it("returns an empty map without a token locally", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("CI", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchRepoStats(["o/n"])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops only the repo GitHub could not resolve and defaults the colour", async () => {
    vi.stubEnv("GITHUB_TOKEN", "tok");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ data: { r0: node, r1: null }, errors: [{ message: "Could not resolve to a Repository with the name 'o/Gone'." }] }),
      ),
    );
    const stats = await fetchRepoStats(["O/Good", "o/gone"]);
    expect([...stats.keys()]).toEqual(["o/good"]);
    expect(stats.get("o/good")).toMatchObject({ stars: 3, openIssues: 2, latestRelease: null, language: { name: "Rust", color: "#64748b" } });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("o/gone"));
  });

  it("skips unsafe names without querying them", async () => {
    vi.stubEnv("GITHUB_TOKEN", "tok");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ data: { r0: node } }));
    vi.stubGlobal("fetch", fetchMock);
    const stats = await fetchRepoStats(["o/ok", 'o/x") { id } #']);
    expect([...stats.keys()]).toEqual(["o/ok"]);
    const sent = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(sent).not.toContain("{ id }");
    expect(sent).not.toContain('"o1"');

  });

  it("throws on non-2xx and malformed bodies", async () => {
    vi.stubEnv("GITHUB_TOKEN", "tok");
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 502)));
    await expect(fetchRepoStats(["o/n"])).rejects.toThrow(/HTTP 502/);
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: { r0: { stargazerCount: "many" } } })));
    await expect(fetchRepoStats(["o/n"])).rejects.toThrow(/unexpected shape/);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(fetchRepoStats(["o/n"])).rejects.toThrow(/offline/);
  });
});
