# Annotation Assistant — Frontend

React + TypeScript + Vite frontend for Annotation Assistant.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
```

The dev server includes a live demo at `http://localhost:5173/demo`.

## Demo — build and run locally

The demo is a self-contained static build with mocked API responses. No backend required.

**Build:**

```bash
npm install
npm run build:demo
```

Output is written to `dist-demo/`.

**Run:**

```bash
cd dist-demo
npx serve .
```

Open `http://localhost:3000` in your browser.

**Share as a zip:**

```bash
npm run build:demo
zip -r annotation-demo.zip dist-demo/
```

Recipients unzip and run `npx serve .` inside the folder.

## GitHub Pages deployment (repo owner action required)

The workflow at `.github/workflows/deploy-demo-pages.yml` builds and deploys the demo to GitHub Pages automatically on every push to `main`. (Need to change the branch github workflow after merge, currently points to `static-ui` branch)

Because this is a private repository, GitHub Pages must be explicitly enabled and made public by a **repo owner or admin**. This cannot be done by collaborators.

### One-time setup steps

1. **Enable GitHub Actions write access**
   - Go to **Settings → Actions → General**
   - Under *Workflow permissions*, select **Read and write permissions**
   - Save

2. **Enable GitHub Pages**
   - Go to **Settings → Pages**
   - Under *Source*, select **GitHub Actions** (not a branch)
   - Save

3. **Make the Pages site public** *(private repo requirement)*
   - Still on **Settings → Pages**
   - Check the visibility — GitHub may require a paid plan (GitHub Team or Enterprise) to have a public Pages site from a private repo
   - If available, set visibility to **Public**
   - If not available on your plan, consider mirroring the `dist-demo/` output to a separate public repo and deploying from there

4. **Change the workflow branch trigger to `main`**
   - In `.github/workflows/deploy-demo-pages.yml`, change `static-ui` to `main` after merging this branch
   - There is a `# TODO` comment marking the line

### After setup

Every push to `main` triggers a build and deploys to:
```
https://<org-or-user>.github.io/<repo-name>/
```

You can also trigger a deployment manually from the **Actions** tab → **Deploy Demo to GitHub Pages** → **Run workflow**.

## Production build

```bash
npm run build      # output → dist/
npm run preview    # preview the production build locally
```
