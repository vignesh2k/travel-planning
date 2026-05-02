"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChatInput } from "./ChatInput";
import { getBrowserToken } from "@/lib/auth.browser";
import { postBrief } from "@/lib/api";

export function ChatInputClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <ChatInput
      pending={pending}
      onSubmit={async (brief) => {
        setPending(true);
        try {
          const token = await getBrowserToken();
          if (!token) {
            router.push("/auth/signin");
            return;
          }
          const trip = await postBrief(brief, token);
          router.push(`/trip/${trip.slug}`);
        } finally {
          setPending(false);
        }
      }}
    />
  );
}
