from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import get_settings

settings = get_settings()
app = FastAPI(title="Atlas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
