# 3F Club — Website Rebuild

A ground-up modernization of [3fclub.org](https://3fclub.org), the site for the
**Fin, Feather and Fur Conservation Society, Inc.** — a private conservation and
sportsmen's club on a 402-acre property in the Town of Lewiston, New York.

## Status

**Design and planning stage.** This repository currently contains static HTML
mockups only. There is no application code, database, or running site yet.

## Contents

### Planning

| File | What it is |
|---|---|
| [`mockups/00-brief.html`](mockups/00-brief.html) | Audit of the current site, proposed public/member/admin structure, technology stack, hosting options, and build sequence |

### Public site directions

| File | Direction | Character |
|---|---|---|
| [`01-heritage-crest.html`](mockups/01-heritage-crest.html) | A — Heritage Crest | Hunter green, ivory and aged brass |
| [`02-field-guide.html`](mockups/02-field-guide.html) | B — Field Guide | Light editorial park-guide on contour lines |
| [`03-range-status.html`](mockups/03-range-status.html) | C — Range Status | Dark operational board, live open/closed state |
| [`06-blaze-timber.html`](mockups/06-blaze-timber.html) | D — Blaze & Timber | Generated woodland camo with blaze orange |
| [`07-clay-break.html`](mockups/07-clay-break.html) | E — Clay Break | Competition scoreboard, Summer Classic results |
| [`08-still-water.html`](mockups/08-still-water.html) | F — Still Water | Lake blue and warm sand, the family side |

### Private areas

| File | What it is |
|---|---|
| [`04-member-portal.html`](mockups/04-member-portal.html) | Members-only area |
| [`05-admin-console.html`](mockups/05-admin-console.html) | Board and committee-chair console |

### Tests

```bash
node tests/run.mjs
```

156 checks across all nine mockups, no dependencies. Covers markup balance, unique
ids, dead internal links, undefined and unused CSS variables, webfonts that are
declared but never loaded, accessibility (pinch zoom, focus styles, reduced
motion, SVG labelling), and canvas rendering — the drawing scripts are executed
against a stubbed DOM to confirm they size their canvas and actually paint.

It also carries regression tests for four bugs found during review: the grid
column that let wide tables push the page sideways, the block-level flex strip
that leaked its background, the `::after` decoration that painted over content,
and canvases that gave up if layout settled late.

The suite is verified by mutation testing — nine deliberate defects were
introduced and all nine were caught.

### Hosting

| File | What it is |
|---|---|
| [`deploy/README.md`](deploy/README.md) | Azure hosting plan, costs, and first-deployment steps |
| [`deploy/main.bicep`](deploy/main.bicep) | App Service B1, Postgres Flexible Server, Blob Storage |
| [`deploy/github-workflow.yml`](deploy/github-workflow.yml) | CI/CD template — **not** yet in `.github/workflows/` |

Each mockup is self-contained — open it in a browser, no build step. The camo,
contour and water backgrounds are generated on a `<canvas>` from a fixed seed, so
they look identical on every device without shipping an image.

**The Azure infrastructure has not been deployed or validated** — there was no
Azure CLI available when it was written. See the warning in
[`deploy/README.md`](deploy/README.md).

## About the content in these mockups

**The data shown is illustrative and invented.** Member counts, dues figures,
application records, league scores, key card statuses and audit log entries are
all fabricated to demonstrate layout and behavior. They are not real club records.

Some mockups use names of real club members and board members that appear on the
club's existing public website, placed alongside this invented data purely to make
the examples read naturally. **Nothing shown about any named person is a real record.**

Factual details about the club itself — facilities, hours, the membership
application window, meeting schedule, and program descriptions — were taken from
the club's current public website and are accurate as of August 2026.

## Planned stack

TypeScript (strict) · Next.js 15 (App Router, React Server Components) ·
Tailwind CSS v4 + shadcn/ui · Postgres (Neon) via Drizzle ORM · Payload CMS 3 ·
Auth.js v5 · Stripe · Resend · Vercel + GitHub Actions · Vitest, Playwright, Biome · Sentry

See the [rebuild brief](mockups/00-brief.html) for the reasoning behind each choice.

## Note on the current live site

The existing site's TLS certificate expired on **July 5, 2018**. Visitors reaching
`https://3fclub.org` receive a browser security warning. This is publicly observable
and is documented here because fixing it is the first item of work — it does not
depend on the rebuild.
