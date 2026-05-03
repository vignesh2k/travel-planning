<!-- BEGIN:fastapi-agent-rules -->
# API Gotchas

- **fpdf2 `multi_cell(dry_run=True)` does NOT advance the cursor.** We hit this twice. After a dry run you must re-call `multi_cell` without `dry_run` or manually set `x`/`y`. To measure height from a dry run, count `len(returned_lines) * line_height` — don't read `pdf.get_y()`.
- **Symbola fallback font requires aliasing under both `""` and `"B"` styles.** Registering it under just the default style won't make it available for bold cells. See `api/api/pdf.py` — the `add_font("symbols", style="B", ...)` aliasing line.
- **Supabase uses ECC P-256 JWT signing.** We verify via JWKS, not the legacy HS256 secret. Don't try to verify tokens with the `SUPABASE_JWT_SECRET`. See `api/api/auth.py` — `_fetch_jwks` + `current_user`.
- **Cloud Build needs specific IAM roles on the compute service account.** We hit this once on first deploy. The default `$PROJECT_NUMBER-compute@developer.gserviceaccount.com` needs:
  ```
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member=serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com \
    --role=roles/storage.objectViewer
  # repeat for roles/logging.logWriter and roles/artifactregistry.writer
  ```
- **Never commit `.venv/` or `*.egg-info/`.** The root `.gitignore` covers them, but `git add .` from `api/` once dragged 2,800 files in. Always run `git status` and confirm the file list before committing — staged paths under `.venv/`, `__pycache__/`, `*.egg-info/`, or `.pytest_cache/` mean stop and re-stage explicitly.
<!-- END:fastapi-agent-rules -->
