# Blank template assets

Copy these into the project root when deploying a **new** site:

```bash
npm run apply-template
```

Works on Windows, macOS, and Linux.

Then set branding in `/admin` after first deploy, or rely on API defaults (`Weekly Picker`, neutral gray).

Keep production HTML/icons and venue lists out of git; store backups under a gitignored `instances/your-site/` folder if you want.
