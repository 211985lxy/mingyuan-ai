# Deploy to Cloudflare Pages

Deploy the web application to Cloudflare Pages using Wrangler CLI.

## Prerequisites

- Wrangler CLI must be installed (`npm install -g wrangler`)
- User must be authenticated with Cloudflare (`wrangler login`)
- The web app must be in a `web/` directory with a build script

## Task

When the user asks to deploy to Cloudflare Pages, follow these steps:

1. **Navigate to the web directory** and verify the project structure
2. **Build the web application** using `npm run build`
3. **Deploy to Cloudflare Pages** using Wrangler

## Steps

### Step 1: Verify and Build

```bash
cd web
npm run build
```

Verify that the build completed successfully and the `dist/` directory exists.

### Step 2: Deploy to Cloudflare Pages

Deploy using Wrangler Pages:

```bash
CLOUDFLARE_ACCOUNT_ID=4afe694ac3841dc3e433b6369c754346 wrangler pages deploy dist --project-name=web-2048 --commit-dirty=true
```

**Important Notes:**
- The `--project-name` is "web-2048" as specified in wrangler.toml
- The `CLOUDFLARE_ACCOUNT_ID` is required for the ROI BEST PTE. LTD. account
- Use `--commit-dirty=true` to allow deployment with uncommitted changes
- If the project already exists, it will create a new deployment
- The deployment URL will be shown in the output

### Step 3: Confirm Deployment

After deployment completes:
1. Show the deployment URL to the user
2. Confirm the deployment was successful
3. The production URL is typically: `https://lumina2048.pages.dev`

## Authentication

If the user is not authenticated with Cloudflare:

```bash
wrangler login
```

This will open a browser for OAuth authentication.

## Troubleshooting

- **"Not authenticated"**: Run `wrangler login`
- **Project name conflict**: Check Cloudflare Pages dashboard for existing project name
- **Build errors**: Ensure all dependencies are installed with `npm install`
- **Wrong directory**: The `dist/` folder should contain the built static files

## Example Usage

User: "deploy to cloudflare"
Assistant: [Executes the steps above and deploys to Cloudflare Pages]

## Output Format

After successful deployment, provide:
- ✅ Build status
- 🚀 Deployment status
- 🌐 Production URL
- 📊 Deployment details (if available)
