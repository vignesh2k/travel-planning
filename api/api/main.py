from fastapi import FastAPI

app = FastAPI(title="Atlas API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
