import { fetchProjects } from "./blog";
import { fetchRepoStats } from "./github";
import { buildPageModel } from "./model";
import type { PageModel } from "./schema";

export async function loadPageModel(): Promise<PageModel> {
  const projects = await fetchProjects();
  const repos = projects.flatMap((p) => (p.repo ? [p.repo] : []));
  const stats = await fetchRepoStats(repos);
  return buildPageModel(projects, stats, new Date());
}
