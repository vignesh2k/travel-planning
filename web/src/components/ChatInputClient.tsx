"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChatInput } from "./ChatInput";
import { StreamingOverlay } from "./StreamingOverlay";
import { getBrowserToken } from "@/lib/auth.browser";
import { streamTrip } from "@/lib/streamingTrip";
import type { Place } from "@/lib/types";

export function ChatInputClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);

  return (
    <>
      <ChatInput
        pending={pending}
        onSubmit={async (brief) => {
          setPending(true);
          setStatus("Sending your brief…");
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
      {pending && <StreamingOverlay status={status} places={places} />}
    </>
  );
}
