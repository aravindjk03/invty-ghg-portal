# Deploying the portal

The website is a static site. It is built on your machine and pushed to the
`gh-pages` branch, which GitHub Pages serves at

**https://aravindjk03.github.io/invty-ghg-portal/**

Nothing else needs to run for the site to work: the calculation engine is
Python compiled to WebAssembly and runs in the visitor's browser.

---

## Deploy

From the repository root:

```bash
git checkout main
git pull origin main
npm --prefix frontend install    # first time, or after dependencies change
npm run deploy:pages
```

That is the whole deploy. It prints the live URL when it finishes.

Needs Node 20 or newer, and push access to the repository.

### What it does

1. Builds the site into `frontend/dist`, with the base path set to
   `/invty-ghg-portal/` so the asset links resolve under the repository name.
2. Checks out `gh-pages` in a temporary worktree, replaces its contents with
   the build, and writes `.nojekyll` so GitHub serves the files as built.
3. Commits as "Publish website from `<commit>`" and pushes.

It never rewrites history — each deploy is one new commit on `gh-pages` — so
you can always see which source commit produced the live site, and roll back.

### If nothing changed

It prints `The published site is already up to date.` and pushes nothing.

---

## The part that is easy to get wrong

The site is built once and the addresses of the two server parts are baked in
**at build time**. With none set, the published site calls `localhost`, which
is what it does today — accounts and inventories stay in each visitor's
browser, and the AI product estimate cannot run.

Once the servers are hosted, pass their addresses on the deploy command:

```bash
IINVTY_BACKEND_URL=https://iinvty-backend.onrender.com/api/v1 \
IINVTY_AI_URL=https://iinvty-insity-edge-ai.onrender.com \
npm run deploy:pages
```

| Variable | What it sets | Without it |
|---|---|---|
| `IINVTY_BACKEND_URL` | Accounts, sign-in, leads, entitlements | Browser-only trial; leads are queued locally |
| `IINVTY_AI_URL` | The product carbon estimate service | The estimate cannot run |
| `IINVTY_GOOGLE_CLIENT_ID` | Google sign-in | Falls back to `frontend/.env.production`, which already has one |

The script warns you when the first two are unset.

**There is no AI-key variable, on purpose.** Anything built into the site is
readable by every visitor, so the AI key is set only on the estimate service
(`GEMINI_API_KEY` in `render.yaml`), where usage is metered per account.

---

## Rolling back

`gh-pages` keeps every publish, so:

```bash
git fetch origin gh-pages
git log --oneline origin/gh-pages      # find the good one
git push origin <that-commit>:gh-pages --force-with-lease
```

Or just check out the source commit it names and run `npm run deploy:pages`
again, which is safer because it leaves the history intact.

---

## Putting it on your own domain

The portal currently sits on `aravindjk03.github.io`, which is a different
origin from your CMS — so the two cannot share visitor tracking, and it reads
as a personal GitHub URL to an enterprise buyer.

1. Add a `CNAME` record at your DNS provider: `ghg` → `aravindjk03.github.io`.
2. Put a file named `CNAME` in `frontend/public/` containing one line:
   `ghg.yourdomain.com`. It is copied into every build, so the domain survives
   each deploy. Without it in `public/`, the next deploy wipes the setting.
3. In the repository's Settings → Pages, set the custom domain and tick
   *Enforce HTTPS* once the certificate is issued.
4. Update `CORS_ORIGIN` in `render.yaml` to the new domain before deploying
   the servers, or they will refuse the browser's requests.

---

## The two servers (not deployed)

`render.yaml` describes both and is ready to use, but neither is running.

- **`iinvty-backend`** — accounts, sign-in, leads, plan limits.
- **`iinvty-insity-edge-ai`** — the product carbon estimate.

Two things in that file to decide before customers see it, both flagged in its
own comments:

- A **free** service sleeps after fifteen minutes idle and takes about a minute
  to wake. While the engine sleeps the page reads "the calculation engine is
  not reachable", so the first visitor each morning meets a product that looks
  broken.
- The free disk is **ephemeral**: every deploy or restart wipes it, so accounts
  created there are lost. Real user accounts need a paid plan with a disk, or
  managed Postgres.

Deploying them is a separate step from deploying the website — and after they
are up, the website must be rebuilt with the two URLs above, or it will keep
calling `localhost`.

---

## Checking a deploy worked

```bash
git fetch origin gh-pages
git log --oneline -1 origin/gh-pages        # "Publish website from <commit>"
```

Then open the site in a private window and confirm the change you expected.
A hard reload may be needed: GitHub Pages caches aggressively, though the
built filenames are content-hashed so a new deploy normally busts it.
