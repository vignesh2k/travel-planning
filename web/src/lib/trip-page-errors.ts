import { ApiRequestError } from "./api.ts";

export function shouldTryBrowserTripLoad(error: unknown): boolean {
  if (error instanceof ApiRequestError) return error.status !== 404;
  return true;
}
