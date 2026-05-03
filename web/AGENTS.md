<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Web Gotchas

- **MapLibre popups have `pointer-events: none` on the root by default.** That means `mouseenter`/`mouseleave` listeners attached to the popup root never fire. Override with `pointer-events: auto !important` in `globals.css` (we already do this for `.atlas-popup`). Without it, hover popups close the moment your cursor leaves the marker dot.
- **Don't set `transform` on a MapLibre marker's root element.** MapLibre uses `transform: translate(...)` on the root to position the marker; setting `transform: scale(...)` on the same element wipes the position and the marker snaps to (0, 0) of the container until the next render tick. Render the visual dot as a CHILD element and animate the child's transform instead. See `web/src/components/Map.tsx`.
- **Tailwind v4 dropped `cursor: pointer` defaults on buttons.** We restore it via a global rule in `globals.css`. If you add a new interactive element that should look clickable, give it `cursor-pointer` or use `<button>`.
- **Server-only Supabase code can't be imported into client components.** `lib/supabase/server.ts` imports `next/headers` which fails to bundle in client modules. Token helpers are split: `lib/auth.ts` (server-only) and `lib/auth.browser.ts` (client-only). Pick the right one for the consumer's runtime.
<!-- END:nextjs-agent-rules -->
