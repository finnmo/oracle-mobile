# Blank template assets

Copy these into the project root when deploying a **new** site (not picker.example.com):

```bash
cp template/index.html index.html
cp template/manifest.json public/manifest.json
cp template/icon.svg public/icon.svg
npm run icons
```

Then set branding in `/admin` after first deploy, or rely on API defaults (`Weekly Picker`, neutral gray).

The live Oracle site keeps its own `index.html`, `manifest.json`, and `icon.svg` at the repo root.
