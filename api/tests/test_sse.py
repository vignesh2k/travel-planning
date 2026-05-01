from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.sse import sse_stream


def test_sse_stream_emits_typed_events() -> None:
    def generator():
        yield ("status", "Mapping…")
        yield ("places", [{"name": "x"}])
        yield ("done", {"slug": "kyoto-7d-aaa"})

    app = FastAPI()

    @app.get("/stream")
    def stream():
        return sse_stream(generator())

    client = TestClient(app)
    with client.stream("GET", "/stream") as res:
        assert res.status_code == 200
        body = res.read().decode()
    assert "event: status" in body
    assert 'data: "Mapping…"' in body
    assert 'event: places' in body
    assert 'data: [{"name": "x"}]' in body
    assert 'event: done' in body
    assert 'data: {"slug": "kyoto-7d-aaa"}' in body
