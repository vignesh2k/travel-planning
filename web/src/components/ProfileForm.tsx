"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveProfile } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import type { Budget, Pace, UserProfile } from "@/lib/types";

const PRESET_INTERESTS = [
  "Food", "Photography", "Hiking", "History", "Nightlife",
  "Beach", "Museums", "Architecture", "Nature", "Shopping",
];
const BUDGETS: { value: Budget; label: string }[] = [
  { value: "cheap", label: "Cheap" },
  { value: "mid", label: "Mid" },
  { value: "premium", label: "Premium" },
];
const PACES: { value: Pace; label: string }[] = [
  { value: "relaxed", label: "Relaxed" },
  { value: "balanced", label: "Balanced" },
  { value: "packed", label: "Packed" },
];

export function ProfileForm({ initial }: { initial: UserProfile | null }) {
  const router = useRouter();
  const [diet, setDiet] = useState(initial?.diet ?? "");
  const [budget, setBudget] = useState<Budget | null>(initial?.budget ?? null);
  const [pace, setPace] = useState<Pace | null>(initial?.pace ?? null);
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [customInterest, setCustomInterest] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(tag: string) {
    setInterests((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }
  function addCustom() {
    const v = customInterest.trim();
    if (!v || interests.includes(v)) return;
    setInterests((prev) => [...prev, v]);
    setCustomInterest("");
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const token = await getBrowserToken();
      if (!token) {
        setError("Not signed in.");
        return;
      }
      await saveProfile(
        {
          diet: diet.trim() || null,
          budget,
          pace,
          interests,
          notes: notes.trim() || null,
        },
        token,
      );
      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      console.error("save profile failed", e);
      setError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="frosted-strong rounded-[18px] p-6 max-w-xl mx-auto flex flex-col gap-5">
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink-900">Travel preferences</h2>
        <p className="text-sm text-ink-500 mt-1">
          Saved once, applied to every future trip. Edit any time.
        </p>
      </div>

      <Field label="Diet">
        <input
          value={diet}
          onChange={(e) => setDiet(e.target.value)}
          placeholder="e.g. vegetarian, no shellfish"
          className="w-full rounded-[10px] bg-white/80 border border-amber-700/12 px-3 py-2 text-sm text-ink-900 outline-none focus:border-amber-600/40"
        />
      </Field>

      <Field label="Budget">
        <Toggle options={BUDGETS} value={budget} onChange={setBudget} allowNull />
      </Field>

      <Field label="Pace">
        <Toggle options={PACES} value={pace} onChange={setPace} allowNull />
      </Field>

      <Field label="Interests">
        <div className="flex flex-wrap gap-2">
          {PRESET_INTERESTS.map((tag) => {
            const on = interests.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggle(tag)}
                className={
                  on
                    ? "rounded-full px-3 py-1 text-xs font-semibold bg-amber-600 text-white"
                    : "rounded-full px-3 py-1 text-xs text-ink-700 bg-white/60 border border-amber-700/10 hover:bg-white/85"
                }
              >
                {tag}
              </button>
            );
          })}
          {interests
            .filter((t) => !PRESET_INTERESTS.includes(t))
            .map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggle(tag)}
                className="rounded-full px-3 py-1 text-xs font-semibold bg-amber-600 text-white"
              >
                {tag} ×
              </button>
            ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            value={customInterest}
            onChange={(e) => setCustomInterest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Add interest…"
            className="flex-1 rounded-[10px] bg-white/80 border border-amber-700/12 px-3 py-1.5 text-xs text-ink-900 outline-none focus:border-amber-600/40"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!customInterest.trim()}
            className="rounded-[10px] bg-white/80 border border-amber-700/12 px-3 py-1.5 text-xs text-ink-700 hover:bg-white/95 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </Field>

      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Anything else? E.g. travelling with parents, light walker, hate seafood, prefer mornings."
          className="w-full rounded-[10px] bg-white/80 border border-amber-700/12 px-3 py-2 text-sm text-ink-900 outline-none focus:border-amber-600/40 resize-none"
        />
        <div className="text-[10px] text-ink-500 mt-1">{notes.length} / 500</div>
      </Field>

      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-sm py-2 px-5 font-medium hover:shadow-md disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
        {savedAt && Date.now() - savedAt < 3000 && (
          <span className="text-xs text-amber-700">Saved ✓</span>
        )}
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-amber-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle<T extends string>({
  options,
  value,
  onChange,
  allowNull = false,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
  allowNull?: boolean;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(allowNull && on ? null : o.value)}
            className={
              on
                ? "rounded-[10px] px-4 py-1.5 text-xs font-semibold bg-amber-600 text-white"
                : "rounded-[10px] px-4 py-1.5 text-xs text-ink-700 bg-white/60 border border-amber-700/10 hover:bg-white/85"
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
