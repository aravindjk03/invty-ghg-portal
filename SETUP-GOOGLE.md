# Turning on "Sign in with Google"

Google only lets a website use its sign-in after the site's owner registers it,
in their own Google account. It is free and takes about ten minutes. Nobody else
can do it for you: the client ID belongs to the Google account that creates it.

The ID the site used before belonged to a project that does not allow this site,
which is why Google showed an error page. It has been removed. Until you add
yours, the Google button is hidden and everything else works.

You need two things at the end: a **Client ID** (it ends in
`.apps.googleusercontent.com`), and the list of addresses your site runs on.
There is **no client secret** to copy; this sign-in does not use one.

---

## 1. Create a Google Cloud project

1. Open **https://console.cloud.google.com/** and sign in with the Google
   account that should own the sign-in (a company account is best).
2. At the top, click the project picker, then **New project**. Name it
   `IINVTY Portal`. Leave the organisation as is. Click **Create**, then
   select the new project.

## 2. Set up the consent screen (what users see when they sign in)

1. Menu, then **APIs & Services**, then **OAuth consent screen**. Newer
   consoles call this **Google Auth Platform**. Click **Get started**.
2. **App information:** App name `IINVTY`, User support email: yours. **Next**.
3. **Audience:** **External**, so anyone with a Google account can sign in.
   **Next**.
4. **Contact information:** your email. **Next**, tick the policy box,
   **Create**.
5. Open **Audience** and click **Publish app**, then confirm, so the
   publishing status reads **In production**.

   > If you skip this, the app stays in **Testing**: only the test users you
   > list can sign in, and everyone else sees *"Access blocked: IINVTY has not
   > completed the Google verification process"*.
   >
   > The app only asks for name, email and picture (`openid`, `email`,
   > `profile`). Google does not require a verification review for these, so
   > publishing is immediate.

6. Optional: under **Branding**, add your logo and your site's home page,
   privacy policy and terms links.

## 3. Create the Web client

1. Open **Clients**. Older consoles call this **Credentials**, then **Create
   credentials**, then **OAuth client ID**.
2. Click **Create client**.
3. **Application type:** **Web application**. **Name:** `IINVTY website`.
4. **Authorised JavaScript origins:** click **Add URI** for each address. Each
   one is scheme and host only, with no path and no trailing slash:

   | Add this | Why |
   |---|---|
   | `https://aravindjk03.github.io` | The live website (GitHub Pages). |
   | `http://localhost:5173` | Running the site on your own computer. |
   | `https://app.yourdomain.com` | Later, if you move to your own domain. |

   GitHub Pages serves the site at `/invty-ghg-portal/`, but the origin is
   still just `https://aravindjk03.github.io`.
5. **Authorised redirect URIs:** leave empty. The popup sign-in used here does
   not need any.
6. Click **Create** and copy the **Client ID**. It can take up to 5 minutes
   for Google to recognise a new client or a new origin.

## 4. Put the Client ID in the two places that use it

The ID is public by design: it appears in the page, so it is safe to share
with whoever deploys the site. It goes in exactly two places:

| Where | Name | How |
|---|---|---|
| The website | `IINVTY_GOOGLE_CLIENT_ID` | When publishing: `IINVTY_GOOGLE_CLIENT_ID=<id> IINVTY_BACKEND_URL=… npm run deploy:pages` |
| The backend | `GOOGLE_CLIENT_ID` | In the backend host's environment settings (Render: service, **Environment**). For local runs, in `backend/.env`. |

The backend checks every Google sign-in with Google, and refuses tokens that
were issued to any other client ID. So both places must hold the same ID.

For local development, put `VITE_GOOGLE_CLIENT_ID=<id>` in `frontend/.env`
and `GOOGLE_CLIENT_ID=<id>` in `backend/.env`.

## 5. Check it works

1. Open the live site in a private window and click **Sign in with Google**.
2. Choose an account. You should land in the portal, signed in.
3. In the backend log or the admin console's security log, you'll see an
   `auth.login_ok` event with `via: google`.

## If Google shows an error page

| What Google says | Cause | Fix |
|---|---|---|
| `Error 400: origin_mismatch`, or *"…not a valid origin for the client"* | The address in the browser bar is not in **Authorised JavaScript origins**. | Add it exactly (scheme and host, no path, no trailing `/`). Wait 5 minutes, then retry in a private window. |
| `Error 401: invalid_client`, or *"The OAuth client was not found"* | The site was built with an ID that doesn't exist, or has a typo. | Copy the ID again from **Clients** and republish the site with it. |
| `Error 401: deleted_client` | The client was deleted in the Google project. | Create a new client (step 3) and republish with the new ID. |
| *"Access blocked: … has not completed the Google verification process"* | The consent screen is still in **Testing**. | **Audience**, then **Publish app**. Or add the person as a test user. |
| *"Error 403: access_denied"* | The person declined, or an organisation policy blocks third-party apps. | Try another account, or ask the organisation's Google admin to allow the app. |
| In the portal: *"Google could not confirm this sign-in"* | The website and backend use different client IDs, or the backend has none. | Set `GOOGLE_CLIENT_ID` on the backend to the same ID the site was built with, then restart the backend. |
| In the portal: *"Your browser blocked the Google window"* | Pop-up blocker. | Allow pop-ups for the site. |
