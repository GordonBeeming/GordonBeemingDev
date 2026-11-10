# GordonBeemingDev

The source for gordonbeeming.dev. It's a single static page that lists my projects from the blog, with GitHub stats on each card. The site is built with Astro and rebuilt every day.

## Where the data comes from

The project list comes from the `content/projects/*.json` files in the public `GordonBeeming/xylem` repo, which is the blog's source. The stats come from the GitHub GraphQL API: stars, forks, last push, primary language, latest release and open issues.

Adding a project to the blog adds it here on the next build. Nothing needs to change in this repo.

## Local development

```sh
pnpm install
GITHUB_TOKEN=$(gh auth token) pnpm dev
pnpm check
pnpm test
pnpm build
```

Without a token, local builds still work but the cards have no stats. In CI a missing token fails the build on purpose.

Node 24 is pinned in `.nvmrc`.

## Deploy

`.github/workflows/deploy.yml` runs on pull requests, pushes to `main`, manual dispatch and a daily schedule. The schedule is 19:00 UTC, which is 05:00 AEST (Brisbane, no daylight saving).

The `verify` job runs on every event. It installs, type checks, tests and builds, then uploads `dist` as a workflow artifact. The `deploy` job runs only on `main` and only after `verify` passes. It downloads that same artifact and publishes it with Wrangler to the Cloudflare Pages project `gordonbeeming-dev`, served at gordonbeeming.dev. It doesn't rebuild.

The deploy job needs two repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Deploys use the GitHub environment `production`.

Cloudflare Pages reads response headers from `public/_headers`. That file sets the Content-Security-Policy, which only allows the site's own script, stylesheet and fonts. A new external script, font or image host needs adding there or the browser will block it.

To rebuild by hand:

```sh
gh workflow run deploy.yml
```

## Failure behaviour

If the blog's project list can't be read, or a project file is invalid, the build fails and the last deploy stays live.

If the stats for one repo can't be read, that card is shown without stats and the build logs a warning.
