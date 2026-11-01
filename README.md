# Santasi SDA Church — Accounting System (Backend Edition)

This is the real, persistent version of the church accounting system: a server with a proper database and real logins, instead of the browser-only prototype. Once deployed, data survives closing the browser, and each person signs in with their own username and password.

## What's in this folder

- **`server/`** — the backend: handles logins, stores data in a database file, serves the app
- **`frontend/`** — the part you see and click on, built with React
- **`public/`** — where the built frontend ends up (created automatically during deployment; you don't need to touch it, and it's normal for it to be empty in this folder before the first deploy)

You do not need to understand the code to deploy this. Follow the steps below in order. Railway handles building the front-end and starting the server automatically — there's no separate "build" step for you to run.

---

## Step 1 — Get the code onto GitHub

1. Go to [github.com](https://github.com) and create a free account if you don't have one.
2. Click the **+** icon (top right) → **New repository**.
3. Name it something like `santasi-sda-accounts`. Keep it **Private**. Click **Create repository**.
4. On the next page, click **uploading an existing file**.
5. Drag this entire folder's contents into the upload box (everything inside `church-backend`, not the folder itself — `server/`, `frontend/`, `package.json`, `.gitignore`, etc. should all be visible at the top level of the repo).
6. Scroll down, click **Commit changes**.

## Step 2 — Generate your secret key

This key keeps login sessions secure. You need to generate it once, before deploying.

The most reliable way: ask anyone with a computer that has Node.js installed (most developers do) to run this single command and send you the result:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
It prints a long string of random letters and numbers — that's your secret. Copy it; you'll paste it into Railway in Step 4.

If nobody nearby can run that command, a free alternative is [random.org's string generator](https://www.random.org/strings/) — generate one string, length 64, using letters and digits. Either method works equally well; what matters is that it's long, random, and not shared publicly.

## Step 3 — Create a Railway account and connect GitHub

1. Go to [railway.app](https://railway.app) and sign up (the "Login with GitHub" button is easiest — it connects both accounts in one step).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select the `santasi-sda-accounts` repository you created in Step 1.
4. Railway will start trying to deploy automatically — let it, even though it needs one more setting first (next step).

## Step 4 — Add your secret key

1. In your new Railway project, click on the service box (it'll have your repo name on it).
2. Click the **Variables** tab.
3. Click **New Variable**. For the name, type `JWT_SECRET`. For the value, paste the long string you generated in Step 2.
4. Click **Add**.

Railway will automatically redeploy with this setting.

## Step 5 — Attach persistent storage (important — don't skip this)

By default, Railway treats your service's files as temporary — they can be wiped every time you deploy an update. Since your church's financial data lives in a file (`data/church.db`), you need to tell Railway to keep that one folder permanently.

1. In your service, click the **Settings** tab.
2. Find **Volumes** (sometimes under a "Storage" section) and click **New Volume** (or **Add Volume**).
3. Set the **mount path** to exactly `/app/data`.
4. Save. Railway will redeploy.

If you skip this step, the app will still work — until the next time you deploy an update or Railway restarts the service, at which point all recorded transactions, members, and accounts would be lost. Do this before you start entering real data.

## Step 6 — Find your live URL

1. Still in your service, click the **Settings** tab.
2. Under **Networking**, click **Generate Domain**.
3. Railway gives you a URL like `santasi-sda-accounts.up.railway.app`. This is your church's accounting system's address. Bookmark it.

## Step 7 — Get the first logins

1. Click the **Deployments** tab, then click on the most recent (top) deployment.
2. Click **View Logs**.
3. Scroll through the log output for a block that looks like this:
   ```
   Seed complete. Starter logins (each must change their password on first sign-in):

     Treasurer (you)      username: treasurer.you      temporary password: harbor-42-cedar
     Head Elder           username: head.elder         temporary password: willow-17-ember
     Church Auditor       username: church.auditor     temporary password: amber-63-ridge
   ```
4. **Write these down now.** This is the only time these temporary passwords are shown — they cannot be recovered afterward, only reset by the Treasurer from the Admin page once signed in.

## Step 8 — Sign in

1. Open the URL from Step 6 in your browser.
2. Sign in as the Treasurer using the username and temporary password from Step 7.
3. You'll be asked to set a real password immediately — do that first.
4. From there, go to the **Admin** page to add real people, assign them roles, and give each of them their own username and temporary password (the same way the seed ones were generated) — share each one securely, in person or by phone, not by writing it somewhere public.

---

## Updating the app later

If you ask me (Claude) to make changes to this system in the future, I'll give you updated files. To deploy an update:

1. Go to your GitHub repository in the browser.
2. Upload the new/changed files the same way you did in Step 1 (GitHub will ask if you want to replace the existing files — say yes).
3. Commit the changes.
4. Railway automatically redeploys within a minute or two. No further action needed.

Your data (transactions, members, categories, etc.) is stored separately from the code and is not affected by these updates.

## Backing up your data

Your church's financial data lives in a single file inside the Volume you attached in Step 5. To download a backup:

1. In Railway, open your project and look at the **Volumes** section of your service for an option to browse or download files (Railway's interface for this changes occasionally — search Railway's own documentation for "volumes" if you don't see an obvious option).
2. The database file is at `/app/data/church.db`.

Doing this monthly, or asking your technical contact to set up an automatic backup, is strongly recommended — there is currently no automatic backup built into this system.

## If something goes wrong

- **Can't sign in / "Incorrect username or password"** — double check there's no extra space copied along with the username/password. Usernames are not case-sensitive; passwords are.
- **Forgotten password** — the Treasurer can reset anyone's password from the Admin page, generating a new temporary one.
- **Treasurer forgot their own password** — ask whoever has Railway access to look at the Variables tab and temporarily note the `JWT_SECRET`, then use Railway's console (or ask Claude for a one-time script) to reset the Treasurer's password directly in the database. This is a rare-enough situation that it's worth asking for help at that point rather than guessing.
- **The site won't load at all** — check Railway's Deployments tab for a red/failed deployment and view its logs; the error message there usually says exactly what's wrong (commonly: `JWT_SECRET` not set).
