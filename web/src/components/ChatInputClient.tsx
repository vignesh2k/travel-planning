"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChatInput } from "./ChatInput";
import { StreamingOverlay } from "./StreamingOverlay";
import { SuggestionChips } from "./SuggestionChips";
import { getBrowserToken } from "@/lib/auth.browser";
import { streamTrip } from "@/lib/streamingTrip";
import type { Place } from "@/lib/types";

export function ChatInputClient({ hasProfile = false }: { hasProfile?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [chars, setChars] = useState(0);
  const [places, setPlaces] = useState<Place[]>([]);

  const placeholder = hasProfile
    ? "Where to next? E.g. 7 days in Kyoto, mid-October"
    : "7 days in Kyoto, vegetarian, photography focus, mid-October…";

  return (
    <>
      <ChatInput
        text={text}
        setText={setText}
        pending={pending}
        placeholder={placeholder}
        onSubmit={async (brief) => {
          setPending(true);
          setStatus("Sending your brief…");
          setChars(0);
          setPlaces([]);
          try {
            const token = await getBrowserToken();
            if (!token) {
              router.push("/auth/signin");
              return;
            }
            await streamTrip(
              process.env.NEXT_PUBLIC_API_BASE!,
              token,
              brief,
              {
                onStatus: setStatus,
                onProgress: setChars,
                onPlace: (p) => setPlaces((prev) => [...prev, p]),
                onDone: (slug) => router.push(`/trip/${slug}`),
                onError: (e) => {
                  console.error(e);
                  setStatus(`Error: ${e.message}`);
                  setPending(false);
                },
              },
            );
          } catch (e) {
            console.error(e);
            setPending(false);
          }
        }}
      />
      <SuggestionChips onPick={setText} />
      {pending && <StreamingOverlay status={status} chars={chars} places={places} />}
    </>
  );
}
