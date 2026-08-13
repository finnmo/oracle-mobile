# Private instance configs

Keep production venue lists, branding backups, and deploy notes **out of this public repo**.

Locally you can keep a folder such as `instances/your-site/` — it is gitignored via `instances/*/`.

Suggested contents (gitignored):
- `seed-pubs.sql` — your venues
- `branding.json` — optional branding backup
- `README.md` — your deploy notes

Production `wrangler.toml` is also gitignored; copy from `wrangler.toml.example`.
