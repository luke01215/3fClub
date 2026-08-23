# 3F Club — Website Rebuild

A ground-up modernization of [3fclub.org](https://3fclub.org), the site for the
**Fin, Feather and Fur Conservation Society, Inc.** — a private conservation and
sportsmen's club on a 402-acre property in the Town of Lewiston, New York.

## Status

**Design and planning stage.** This repository currently contains static HTML
mockups only. There is no application code, database, or running site yet.

## Contents

| File | What it is |
|---|---|
| [`mockups/00-brief.html`](mockups/00-brief.html) | Audit of the current site, proposed public/member/admin structure, technology stack, and build sequence |
| [`mockups/01-heritage-crest.html`](mockups/01-heritage-crest.html) | Public site, Direction A — hunter green, ivory and aged brass |
| [`mockups/02-field-guide.html`](mockups/02-field-guide.html) | Public site, Direction B — light editorial park-guide |
| [`mockups/03-range-status.html`](mockups/03-range-status.html) | Public site, Direction C — dark operational status board |
| [`mockups/04-member-portal.html`](mockups/04-member-portal.html) | Members-only area |
| [`mockups/05-admin-console.html`](mockups/05-admin-console.html) | Board and committee-chair console |

Each file is self-contained — open it in a browser, no build step.

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
