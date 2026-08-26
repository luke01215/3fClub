# Hosting the 3F Club site on Azure

Everything needed to stand up the club's site on Azure App Service. Nothing here
has been run yet — see [Before you trust this](#before-you-trust-this).

## The short version

| | |
|---|---|
| **App** | App Service **B1** Linux, Node 22, Always On |
| **Database** | Postgres Flexible Server, **Standard_B1ms** burstable, 32 GB |
| **Files** | Storage account, two private containers (`media`, `documents`) |
| **TLS** | App Service Managed Certificate — free, auto-renews |
| **CI/CD** | GitHub Actions with OIDC (no stored publish profile) |
| **Cost** | roughly **$32/month** |

## Why B1 and not something cheaper

Capacity is not the reason. With ~640 members this site will see a couple of
hundred visits a day, and B1's single core could serve that several hundred times
over. Two other things set the floor:

- **Always On.** Free and Shared tiers unload the app after 20 minutes idle. On a
  site this quiet, that means most visitors would wait 10–30 seconds for a cold
  start. Always On requires Basic or above.
- **Free managed TLS.** App Service Managed Certificates cost nothing and renew
  themselves, but they are not offered on Free or Shared tiers. This is the
  permanent fix for the certificate that expired in 2018 — it cannot recur.

Scale-to-zero options like Container Apps are actively the wrong shape here: low
traffic means nearly every visitor pays the cold start, and pinning a minimum
replica costs about the same as B1 with more moving parts.

## Cost breakdown

| Item | Monthly |
|---|---|
| App Service B1 Linux | ~$13 |
| Postgres Flexible B1ms + 32 GB | ~$18 |
| Storage (a few GB, low traffic) | ~$1 |
| Email (Resend free tier) | $0 |
| **Total** | **~$32** |

New Azure accounts get 12 months of free B1ms Postgres, which covers the database
for the first year.

**On nonprofit credits:** Microsoft grants eligible nonprofits $2,000/year in Azure
credits, which would cover this outright. Eligibility requires status equivalent to
**501(c)(3)**, and a sportsmen's/social club is most likely **501(c)(7)** — which
generally does not qualify. Worth ten minutes with whoever files the club's return.
Do not budget against it until someone confirms.

## First deployment

```bash
az login
az group create -n rg-3fclub -l eastus
```

```bash
az deployment group create -g rg-3fclub -f deploy/main.bicep -p deploy/main.parameters.json -p dbAdminPassword='<strong-password>'
```

Do a dry run first — this prints exactly what would change and catches most
template mistakes before anything is created:

```bash
az deployment group what-if -g rg-3fclub -f deploy/main.bicep -p deploy/main.parameters.json -p dbAdminPassword='<strong-password>'
```

The database password is a `@secure()` parameter. Pass it on the command line or
from a secret store — never put it in `main.parameters.json`.

## Custom domain and certificate

Once the app is running, map `3fclub.org` and issue the free certificate.

⚠️ **Check this early.** `3fclub.org` is an apex (naked) domain. Confirm managed
certificate coverage for the apex specifically — if it will not cover it, plan on
`www.3fclub.org` as canonical with an apex redirect. This is a 20-minute discovery
if you do it up front and a launch-day emergency if you do not.

```bash
az webapp config hostname add -g rg-3fclub --webapp-name app-3fclub --hostname www.3fclub.org
```

```bash
az webapp config ssl create -g rg-3fclub --name app-3fclub --hostname www.3fclub.org
```

## Application settings the Bicep does not set

The template sets `DATABASE_URL` and the storage settings. These still need adding,
either in the portal or with `az webapp config appsettings set`:

| Setting | What it is |
|---|---|
| `AUTH_SECRET` | Random 32+ byte string for Auth.js session signing |
| `AUTH_URL` | `https://3fclub.org` once the domain is mapped |
| `RESEND_API_KEY` | Transactional email |
| `STRIPE_SECRET_KEY` | Dues, pheasant packages, apparel |
| `STRIPE_WEBHOOK_SECRET` | Verifies incoming Stripe webhooks |

## What the app itself must do

- `next.config.mjs` must set `output: 'standalone'`, or the deployed bundle will
  not have a `server.js` for App Service to start.
- Expose `GET /api/health` returning 200. The Bicep points App Service's health
  check at it, and the workflow smoke-tests it after every deploy.
- **Stay at one instance.** Next.js ISR writes its cache to local disk; running
  multiple instances needs a shared cache handler that this scale does not justify.

## CI/CD

[`github-workflow.yml`](github-workflow.yml) is a template, deliberately **not** in
`.github/workflows/`. Moving it there before the Azure resources and repository
secrets exist means it runs on every push and fails.

When you are ready:

```bash
mkdir -p .github/workflows && git mv deploy/github-workflow.yml .github/workflows/deploy.yml
```

It authenticates with OIDC federated credentials rather than a downloaded publish
profile, so no long-lived secret sits in the repository. Set `AZURE_CLIENT_ID`,
`AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` as repository secrets first.

## Before you trust this

**None of this has been executed.** There is no Azure CLI on the machine where it
was written, so the Bicep has not been compiled, validated, or deployed, and the
workflow has never run. Structure and resource shapes were written carefully and
the file is syntactically balanced, but treat the first deployment as a real
debugging session rather than a formality.

Run these before believing any of it:

```bash
az bicep build -f deploy/main.bicep
```

Then the `what-if` above. Expect to fix at least one API version or property name —
Azure resource schemas move, and this was written against 2023–2024 versions.

## Deliberately not included

- **VNet integration and private endpoints.** The Postgres firewall currently allows
  Azure-internal traffic. That is reasonable for a club site; tighten it if the
  club's risk appetite changes.
- **Staging slots.** Deployment slots need Standard tier or above. At this scale,
  GitHub Actions plus the smoke test is proportionate.
- **Geo-redundant backups and HA.** Both disabled. Backups are retained 14 days
  locally, which is the right trade for a $32/month budget.
