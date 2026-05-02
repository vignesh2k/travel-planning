"use client";

import { SuggestionChips } from "./SuggestionChips";

export function SuggestionChipsClient() {
  return (
    <SuggestionChips
      onPick={(text) => {
        const ev = new CustomEvent("atlas:prefill", { detail: text });
        window.dispatchEvent(ev);
      }}
    />
  );
}
