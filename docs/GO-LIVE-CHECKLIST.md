# Go-live checklist

Do these in order. Each step says how to check it worked before moving on.
Everything here uses free plans. Details for each step are in
[DEPLOY.md](../DEPLOY.md).

Keep a private note (not in git) of each address and secret as you go.

---

### 1. Database: Neon (done)

The repository is linked to Neon project `hidden-fire-39540730`, branch
`production`, in AWS Singapore. `neon deploy` has been run.

- [x] `neon deploy` pulled `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`
      (direct) into `.env.local`.
- [x] Tested end to end against it: the backend suite (22/22), sign-up, a
      restart, and sign-in again.
- [ ] Copy both values from `.env.local` (or the Neon console, **Connect**) for
      step 2.

**Check:** `neon env pull` succeeds, and `.env.local` holds both variables.

### 2. Backend API: Render (about 10 minutes)

- [ ] On render.com: **New**, then **Blueprint**, then pick this repository and
      the branch to deploy.
- [ ] When asked, paste:
  - `DATABASE_URL`: the Neon **pooled** string
  - `DATABASE_URL_UNPOOLED`: the Neon **direct** string
  - `ADMIN_EMAIL`: your email
  - `GEMINI_API_KEY`: from aistudio.google.com, in a project with no billing

  Leave these empty for now: `GOOGLE_CLIENT_ID`, `ADMIN_ORIGIN`,
  `ANTHROPIC_API_KEY`.
- [ ] When the deploy finishes, open the backend's **Logs** and copy the
      **one-time password** printed for `ADMIN_EMAIL`. It is shown once.

**Check:** `https://<backend>.onrender.com/api/health` shows
`"status":"healthy"` and `"kind":"postgres"`.

### 3. AI estimate service: Render (created by the same Blueprint)

- [ ] If Render named the backend differently from `iinvty-backend`, set
      `BACKEND_BASE_URL` on the AI service to `https://<backend>.onrender.com/api/v1`.

**Check:** `https://<ai>.onrender.com/health` shows `"ai_ready": true`.

### 4. Google sign-in (about 10 minutes)

- [ ] Follow [SETUP-GOOGLE.md](../SETUP-GOOGLE.md): project, consent screen
      (**Publish app**), Web client with origins `https://aravindjk03.github.io`
      and `http://localhost:5173`.
- [ ] On the backend (Render, **Environment**), set `GOOGLE_CLIENT_ID` to your
      ID, then save. Render restarts it.

**Check:** the backend log shows no Google warnings. The full test is in step 5.

### 5. Website: publish with the real addresses

```bash
IINVTY_BACKEND_URL=https://<backend>.onrender.com/api/v1 \
IINVTY_AI_URL=https://<ai>.onrender.com \
IINVTY_GOOGLE_CLIENT_ID=<your client id> \
npm run deploy:pages
```

**Check,** in a private browser window at https://aravindjk03.github.io/invty-ghg-portal/:
- [ ] **Create account** with an email works. Then reload, sign out and sign in
      again: the account is still there.
- [ ] **Sign in with Google** opens Google's account chooser and lands you in
      the portal. If Google shows an error page, see the table at the end of
      SETUP-GOOGLE.md.
- [ ] Product Carbon gives an estimate.
- [ ] On Render, restart the backend (**Manual deploy**, then **Restart
      service**), then sign in again. The account survives, because it lives
      in Neon.

### 6. Admin site: Cloudflare Pages

- [ ] Run `cd frontend && VITE_API_BASE_URL=https://<backend>.onrender.com/api/v1 npm run build:admin`.
- [ ] In Cloudflare Pages, upload `frontend/dist-admin` under an unguessable
      name, which gives `https://<name>.pages.dev`.
- [ ] In Cloudflare Zero Trust, then **Access**, add an application for that
      address, allowing only your team's emails.

**Check:** opening it in a private window first asks for Cloudflare Access.

### 7. Lock the console API to the admin site

- [ ] On the backend, set `ADMIN_ORIGIN=https://<name>.pages.dev`, then save.

**Check:**
- [ ] On the admin site, sign in with `ADMIN_EMAIL` and the one-time password,
      then change the password (Settings on the customer site).
- [ ] The **Users** tab lists the account you created in step 5.

### 8. Before inviting customers

- [ ] In the admin console, give team members their staff roles (OPERATOR,
      SECURITY).
- [ ] Optional: move the AI service to a paid plan, so the first visitor of the
      day doesn't wait for it to wake. Same for the backend.
- [ ] Optional: your own domain (DEPLOY.md, "Your own domain").
- [ ] Turn on branch protection so `main` only accepts changes with green CI.
