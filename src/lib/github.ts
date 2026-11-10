import { z } from "zod";
import type { RepoStats, RepoStatsMap } from "./schema";

const GRAPHQL_URL = "https://api.github.com/graphql";
const FALLBACK_LANGUAGE_COLOR = "#64748b";
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;

const repoNodeSchema = z.object({
  stargazerCount: z.number(),
  forkCount: z.number(),
  // Null for a repository that has never been pushed to.
  pushedAt: z.string().nullable(),
  primaryLanguage: z
    .object({ name: z.string(), color: z.string().nullable() })
    .nullable(),
  latestRelease: z.object({ tagName: z.string() }).nullable(),
  issues: z.object({ totalCount: z.number() }),
});

// Each alias is nullable: GitHub returns null for a private or renamed repo
// and reports the reason in `errors`, while the other aliases still resolve.
// Nodes are validated one alias at a time further down, so a single repo with
// an unexpected shape costs that card its stats instead of failing the build.
const responseSchema = z.object({
  data: z.record(z.string(), z.unknown()).nullish(),
  errors: z
    .array(z.object({ message: z.string(), path: z.array(z.union([z.string(), z.number()])).optional() }).loose())
    .optional(),
});

const FIELDS = `
  stargazerCount
  forkCount
  pushedAt
  primaryLanguage { name color }
  latestRelease { tagName }
  issues(states: OPEN) { totalCount }
`;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchRepoStats(repos: readonly string[]): Promise<RepoStatsMap> {
  const token = process.env["GITHUB_TOKEN"];
  if (!token) {
    // A CI deploy without stats would publish a page of zeros.
    if (process.env["CI"]) {
      throw new Error("GITHUB_TOKEN is not set in CI; refusing to build without repo stats");
    }
    console.warn("GITHUB_TOKEN is not set; building without repo stats");
    return new Map();
  }

  const aliases = new Map<string, string>();
  const variables: Record<string, string> = {};
  const declarations: string[] = [];
  const selections: string[] = [];
  for (const repo of new Set(repos.map((r) => r.toLowerCase()))) {
    const [owner, name, ...rest] = repo.split("/");
    if (!owner || !name || rest.length > 0 || !SAFE_NAME.test(owner) || !SAFE_NAME.test(name)) {
      console.warn(`skipping repo with unsafe or malformed name: ${repo}`);
      continue;
    }
    const i = aliases.size;
    const alias = `r${i}`;
    aliases.set(alias, repo);
    variables[`o${i}`] = owner;
    variables[`n${i}`] = name;
    declarations.push(`$o${i}: String!`, `$n${i}: String!`);
    selections.push(`${alias}: repository(owner: $o${i}, name: $n${i}) { ${FIELDS} }`);
  }
  if (aliases.size === 0) return new Map();

  const query = `query(${declarations.join(", ")}) { ${selections.join("\n")} }`;

  let response: Response;
  try {
    response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "projects-site-build",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    throw new Error(`GitHub GraphQL request failed: ${describe(error)}`);
  }
  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed: HTTP ${response.status} ${response.statusText}`.trim());
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    throw new Error(`GitHub GraphQL response is not JSON: ${describe(error)}`);
  }
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`GitHub GraphQL response has an unexpected shape: ${parsed.error.message}`);
  }
  const { data, errors } = parsed.data;
  if (!data) {
    const reason = errors?.map((e) => e.message).join("; ") ?? "no data returned";
    throw new Error(`GitHub GraphQL returned no data: ${reason}`);
  }

  const stats = new Map<string, RepoStats>();
  const shapeFailures: string[] = [];
  for (const [alias, repo] of aliases) {
    // An error whose path starts at this alias can leave a field null inside an
    // otherwise present node; showing that as real data ("no releases") would be wrong.
    const failure = errors?.find((e) => e.path?.[0] === alias);
    if (failure) {
      console.warn(`no stats for ${repo}: ${failure.message}`);
      continue;
    }
    const raw = data[alias];
    if (raw === null || raw === undefined) {
      console.warn(`no stats for ${repo}: repository not returned`);
      continue;
    }
    const parsedNode = repoNodeSchema.safeParse(raw);
    if (!parsedNode.success) {
      console.warn(`no stats for ${repo}: unexpected shape: ${parsedNode.error.message}`);
      shapeFailures.push(repo);
      continue;
    }
    const node = parsedNode.data;
    if (node.pushedAt === null) {
      console.warn(`no stats for ${repo}: repository has no pushes`);
      continue;
    }
    stats.set(repo, {
      stars: node.stargazerCount,
      forks: node.forkCount,
      openIssues: node.issues.totalCount,
      pushedAt: node.pushedAt,
      language: node.primaryLanguage
        ? { name: node.primaryLanguage.name, color: node.primaryLanguage.color ?? FALLBACK_LANGUAGE_COLOR }
        : null,
      latestRelease: node.latestRelease?.tagName ?? null,
    });
  }
  // Every node failing validation means the API contract changed, not that one
  // repo is odd; publishing a page with no stats at all would hide that.
  if (shapeFailures.length === aliases.size) {
    throw new Error("GitHub GraphQL response has an unexpected shape for every repository");
  }
  return stats;
}
