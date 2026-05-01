import json
from collections.abc import Iterable
from typing import Any

from fastapi.responses import StreamingResponse


def sse_stream(events: Iterable[tuple[str, Any]]) -> StreamingResponse:
    """Wrap an iterable of (event_name, payload) tuples as an SSE response."""
    def _generate():
        for name, payload in events:
            yield f"event: {name}\n"
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
