import { z } from "zod";
import { blogProjectSchema, type BlogProject, type Project } from "./schema";

const LISTING_URL =
  "https://api.github.com/repos/GordonBeeming/xylem/contents/content/projects?ref=main";

const listingSchema = z.array(
  z.object({
    name: z.string(),
    type: z.string(),
    download_url: z.string().nullable(),
  }),
);

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "projects-site-build",
  };
  const token = process.env["GITHUB_TOKEN"];
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `owner/name` for a github.com repo URL, else null. Anything with a different
 * host (including look-alikes such as `github.com.evil.example`) is rejected so
 * the stats query never targets a repo the owner didn't point at.
 */
export function parseRepo(github: string | null | undefined): string | null {
  if (!github) return null;
  let url: URL;
  try {
    url = new URL(github);
  } catch {
    return null;
  }
  if (url.hostname !== "github.com") return null;
  const [owner, name] = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (!owner || !name) return null;
  return `${owner}/${name.replace(/\.git$/, "")}`;
}

export function toProject(slug: string, blog: BlogProject): Project {
  const status = blog.status?.trim() ?? "";
  return {
    slug,
    title: blog.title,
    // The blog renders descriptions as markdown; this page shows plain text, so
    // inline-code backticks would appear literally.
    description: blog.description.replaceAll("`", ""),
    techStack: blog.techStack,
    repo: parseRepo(blog.github),
    githubUrl: blog.github ?? null,
    siteUrl: blog.href && blog.href !== blog.github ? blog.href : null,
    appStoreUrl: blog.appStore ?? null,
    status: status === "" ? null : status,
    featured: Boolean(blog.featured),
    date: blog.date.slice(0, 10),
  };
}

async function fetchOk(url: string, what: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { headers: githubHeaders() });
  } catch (error) {
    throw new Error(`${what}: request failed: ${describe(error)}`);
  }
  if (!response.ok) {
    throw new Error(`${what}: HTTP ${response.status} ${response.statusText}`.trim());
  }
  return response;
}

/**
 * Any failure throws: a half-populated list would deploy a page that silently
 * drops projects, and failing the build keeps the previous deploy live.
 */
export async function fetchProjects(): Promise<Project[]> {
  const listingResponse = await fetchOk(LISTING_URL, "project listing");
  let listingJson: unknown;
  try {
    listingJson = await listingResponse.json();
  } catch (error) {
    throw new Error(`project listing: invalid JSON: ${describe(error)}`);
  }
  const listing = listingSchema.safeParse(listingJson);
  if (!listing.success) {
    throw new Error(`project listing: unexpected shape: ${listing.error.message}`);
  }

  const files = listing.data.filter((f) => f.type === "file" && f.name.endsWith(".json"));
  return Promise.all(
    files.map(async (file) => {
      const downloadUrl = file.download_url;
      if (!downloadUrl) throw new Error(`${file.name}: no download_url in listing`);
      const response = await fetchOk(downloadUrl, file.name);
      let raw: unknown;
      try {
        raw = await response.json();
      } catch (error) {
        throw new Error(`${file.name}: invalid JSON: ${describe(error)}`);
      }
      const parsed = blogProjectSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`${file.name}: failed validation: ${parsed.error.message}`);
      }
      return toProject(file.name.replace(/\.json$/, ""), parsed.data);
    }),
  );
}
