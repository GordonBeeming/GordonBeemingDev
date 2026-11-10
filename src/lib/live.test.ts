import { describe, expect, it } from "vitest";
import { loadPageModel } from "./load";

describe.runIf(process.env["LIVE"] === "1")("live pipeline", () => {
  it("loads the real blog list and GitHub stats", async () => {
    const model = await loadPageModel();
    expect(model.projects.length).toBeGreaterThanOrEqual(15);
    const copilot = model.projects.find((p) => p.slug === "copilot-here");
    expect(copilot?.stats?.stars ?? 0).toBeGreaterThan(0);
  }, 60_000);
});
