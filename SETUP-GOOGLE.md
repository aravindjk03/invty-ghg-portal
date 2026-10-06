# Turning on "Sign in with Google"

Google only lets a website use its sign-in after the site's owner registers it.
This is a one-time, free setup in your own Google account. Nobody else can do
it for you, because the client ID is tied to that account.

## 1. Create the client ID (about 5 minutes)

1. Open https://console.cloud.google.com/apis/credentials and sign in.
2. If asked, create a project (any name, e.g. `IINVTY Portal`).
3. If asked to configure the **OAuth consent screen**: choose **External**, enter
   the app name and your email, save. Under **Audience**, click **Publish app**
   so anyone with a Google account can sign in (otherwise only the test users
   you list can).
4. Back on **Credentials**: **Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - **Authorised JavaScript origins**, add both:
     - `https://aravindjk03.github.io`
     - `http://localhost:5173` (for running it on your own computer)
   - Leave **Authorised redirect URIs** empty.
5. Click **Create** and copy the **Client ID** (it ends in
   `.apps.googleusercontent.com`). There is no secret to copy; none is needed.

## 2. Give the client ID to the site

- **Website (GitHub Pages):** rebuild with it set:
  ```bash
  IINVTY_BACKEND_URL=https://iinvty-backend.onrender.com/api/v1 \
  IINVTY_AI_URL=https://iinvty-insity-edge-ai.onrender.com \
  IINVTY_GOOGLE_CLIENT_ID=<your client id> \
  npm run deploy:pages
  ```
- **Backend (Render):** in the `iinvty-backend` service, **Environment**, set
  `GOOGLE_CLIENT_ID` to the same value and save. The backend checks every Google
  sign-in with Google and rejects tokens issued to any other client.
- **Running locally:** put `VITE_GOOGLE_CLIENT_ID=<your client id>` in
  `frontend/.env` and `GOOGLE_CLIENT_ID=<your client id>` in `backend/.env`.

The client ID is public by design (it appears in the page), so it is safe to
share with whoever deploys the site.
