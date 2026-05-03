from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import get_settings
from api.routes import trips as trips_routes
from api.routes import refine as refine_routes
from api.routes import hotels as hotels_routes
from api.routes import pdf as pdf_routes
from api.routes import profile as profile_routes
from api.routes import budget as budget_routes

settings = get_settings()
app = FastAPI(title="Atlas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trips_routes.router)
app.include_router(refine_routes.router)
app.include_router(hotels_routes.router)
app.include_router(pdf_routes.router)
app.include_router(profile_routes.router)
app.include_router(budget_routes.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
