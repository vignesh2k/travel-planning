"use client";

import Link from "next/link";
import { useState } from "react";

import { BrandIcon } from "./BrandMark";

export function ProfileBanner() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="frosted rounded-[14px] px-4 py-3 w-full max-w-xl flex items-center gap-3 anim-fade-in">
      <BrandIcon className="w-5 h-5 shrink-0" />
      <p className="flex-1 text-xs text-ink-700">
        Set your travel preferences to make every trip smarter.{" "}
        <Link href="/profile" className="text-amber-700 font-semibold hover:underline">
          Open preferences →
        </Link>
      </p>
      <button
        type="button"
        onClick={() => setHidden(true)}
        className="text-ink-500 hover:text-ink-900 text-sm"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
