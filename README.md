# Claude Unlimited — browser-only AI workspace

A Claude-inspired multi-provider chat app built with React + Vite. GitHub Pages hosts the static frontend; a Cloudflare Worker securely proxies requests to Anthropic and OpenAI; Supabase provides authentication and per-user chat history.

## What you need

- Chromebook with Chrome
- GitHub account
- Cloudflare account
- Supabase account
- Anthropic API key and/or OpenAI API key

Provider API usage is billed/limited by the provider. This project does not bypass subscriptions, quotas, or safety controls.

## 1. Create the Supabase project

1. Open https://supabase.com and create a project.
2. Open **Project Settings → API** (or **API Keys**).
3. Copy the Project URL and the publishable key (or legacy `anon` key). These are public frontend values; never use the `service_role` key in the browser.
4. Open **SQL Editor → New query**.
5. Paste and run the complete contents of `supabase/schema.sql`.
6. Open **Authentication → URL Configuration**.
7. Set the Site URL to your eventual GitHub Pages URL, for example `https://YOUR-USERNAME.github.io/YOUR-REPO/`.
8. Add that same URL to Redirect URLs if using email confirmation.

## 2. Create the Cloudflare Worker (no terminal required)

1. Open https://dash.cloudflare.com and sign in.
2. Go to **Workers & Pages → Create → Create Worker**.
3. Give it a name such as `claude-unlimited-api` and deploy the starter Worker.
4. Open the Worker, choose **Edit code**, replace the editor contents with all of `worker/index.js`, and deploy.
5. Open **Settings → Variables and Secrets**. Add these variables:
   - `SUPABASE_URL` = your Supabase Project URL
   - `SUPABASE_ANON_KEY` = your Supabase publishable/anon key
   - `ALLOWED_ORIGIN` = your exact GitHub Pages origin, without a trailing slash, e.g. `https://YOUR-USERNAME.github.io`
6. Add provider keys as **Secrets**, not plain text variables:
   - `ANTHROPIC_API_KEY` = your Anthropic API key
   - `OPENAI_API_KEY` = your OpenAI API key
   Add only the provider keys you intend to use.
7. Deploy the Worker after saving settings. Copy its URL, e.g. `https://claude-unlimited-api.YOUR-SUBDOMAIN.workers.dev`. The frontend appends `/chat`.

The Worker checks the Supabase access token against Supabase Auth before forwarding a request. CORS is restricted to the exact GitHub Pages origin. Do not put provider keys in GitHub repository files, GitHub Pages variables, or frontend code.

For stronger production protection, configure Cloudflare rate limiting / WAF rules for the Worker route and set provider spending limits. The sample Worker enforces authentication, request-size and message-count limits, but does not include a persistent per-user quota system.

## 3. Put the project in GitHub using only the browser

1. Download and extract the project ZIP on your Chromebook.
2. Open https://github.com/new and create a repository. A public repository is fine; no secrets are stored in this source.
3. On the new repository page choose **Add file → Upload files**.
4. Upload the extracted project contents (the files inside the `claude-unlimited` folder, not the outer folder itself) and commit to the `main` branch.
5. To edit later, open `https://vscode.dev/github/YOUR-USERNAME/YOUR-REPO` in Chrome. This opens the repository in VS Code for the Web.

## 4. Configure GitHub Actions variables

1. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**.
2. Add these three repository variables:
   - `VITE_SUPABASE_URL` = Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = Supabase publishable/anon key
   - `VITE_API_URL` = full Cloudflare Worker URL, without `/chat`, e.g. `https://claude-unlimited-api.YOUR-SUBDOMAIN.workers.dev`
3. These are build-time public configuration values. Do not add Anthropic/OpenAI provider secrets here.

## 5. Deploy to GitHub Pages

1. In GitHub repository **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
2. Open the **Actions** tab. The workflow named **Build and deploy to GitHub Pages** should run after your commit.
3. Wait for the green check. Your app URL is usually `https://YOUR-USERNAME.github.io/YOUR-REPO/`.
4. If the build fails, open the failed workflow and read the first red step. Confirm all three `VITE_...` variables exist.
5. Add the final site origin (only `https://YOUR-USERNAME.github.io`) to Cloudflare `ALLOWED_ORIGIN` if it differs from the value you used. Redeploy the Worker.

## 6. Create your account and test

1. Open the GitHub Pages URL.
2. Create an account using your email and a password of at least 8 characters.
3. Confirm your email if Supabase email confirmation is enabled.
4. Sign in, select Anthropic or OpenAI, choose a model, and send a test message.
5. Create another chat and check that it appears in Recents.
6. Test Code Assistant mode and attach a small text/code file.

## Chromebook / VS Code for the Web workflow

- No local Node.js or terminal is required for the hosted deployment.
- GitHub Actions installs dependencies and builds the app in GitHub's cloud.
- Use VS Code for the Web to edit source files in the repository.
- Commit your changes to `main`; GitHub Actions automatically rebuilds and deploys.

## Supported uploads and limitations

The initial version reads text-based files up to 250 KB each, with up to five files per message. It supports common source-code, Markdown, CSV, JSON, YAML, SQL and log files. It does not yet extract text from PDFs or Word documents or upload images.

## Security notes

- Supabase publishable/anon keys are intended for browser use when Row Level Security is correctly configured.
- Never expose Supabase `service_role`, Anthropic API keys, or OpenAI API keys in frontend code.
- The Worker verifies the signed-in user's access token with Supabase Auth before calling a provider.
- Database RLS policies restrict each user to their own conversation rows.
- Do not treat CORS as authentication; the Worker performs a separate authentication check.
- Add rate limiting and provider spend alerts before sharing the app publicly.
- A browser app cannot promise unlimited model usage. Provider rate limits, quotas, and billing still apply.
