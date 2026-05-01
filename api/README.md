# Atlas API

FastAPI service backing atlas.viggy.dev. See
[../docs/superpowers/specs/2026-05-01-atlas-travel-planner-redesign-design.md](../docs/superpowers/specs/2026-05-01-atlas-travel-planner-redesign-design.md).

## Local dev

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # then fill in values
uvicorn api.main:app --reload --port 8080
```
