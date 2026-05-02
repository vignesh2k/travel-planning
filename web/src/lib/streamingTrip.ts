import type { Place, TripStreamEvent } from "./types";

export interface StreamCallbacks {
  onStatus: (msg: string) => void;
  onPlace: (place: Place) => void;
  onDone: (slug: string) => void;
  onError: (err: Error) => void;
}

export async function streamTrip(
  apiBase: string,
  token: string,
  body: { text: string; start_date?: string; airport_entry?: string; airport_exit?: string },
  cb: StreamCallbacks,
) {
  const res = await fetch(`${apiBase}/trips/stream`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    cb.onError(new Error(`stream failed ${res.status}`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const ev = parseSseChunk(chunk);
      if (!ev) continue;
      if (ev.type === "status") cb.onStatus(ev.message);
      else if (ev.type === "place") cb.onPlace(ev.place);
      else if (ev.type === "done") cb.onDone(ev.slug);
    }
  }
}

function parseSseChunk(chunk: string): TripStreamEvent | null {
  let event = "";
  let data = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!event || !data) return null;
  try {
    const parsed = JSON.parse(data);
    if (event === "status") return { type: "status", message: parsed };
    if (event === "place") return { type: "place", place: parsed };
    if (event === "done") return { type: "done", slug: parsed.slug };
  } catch {
    return null;
  }
  return null;
}
