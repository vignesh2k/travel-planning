import assert from "node:assert/strict";
import test from "node:test";

test("getTrip exposes the HTTP status when the API rejects the request", async () => {
  process.env.NEXT_PUBLIC_API_BASE = "https://api.example.test";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const { getTrip } = await import(`./api.ts?status-test=${Date.now()}`);
    await assert.rejects(
      () => getTrip("kyoto-7d-test", "token"),
      (error) =>
        error instanceof Error &&
        error.message.includes("getTrip 500") &&
        error.status === 500,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("trip page falls back to browser loading for non-404 server API failures", async () => {
  const { ApiRequestError } = await import("./api.ts");
  const { shouldTryBrowserTripLoad } = await import("./trip-page-errors.ts");

  assert.equal(shouldTryBrowserTripLoad(new ApiRequestError("getTrip 500", 500)), true);
  assert.equal(shouldTryBrowserTripLoad(new ApiRequestError("getTrip 403", 403)), true);
  assert.equal(shouldTryBrowserTripLoad(new ApiRequestError("getTrip 404", 404)), false);
});
