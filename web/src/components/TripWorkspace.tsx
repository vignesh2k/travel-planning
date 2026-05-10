"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { patchTripDocument, saveTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import { selectedPlaceNameForFocus } from "@/lib/map-focus";
import type { Budget, Place, PublicTrip, TripDocument, TripFull } from "@/lib/types";

import { Map } from "./Map";
import { MobileSheet } from "./MobileSheet";
import { PdfExportMenu } from "./PdfExportMenu";
import { SaveTripButton } from "./SaveTripButton";
import { ShareMenu } from "./ShareMenu";
import { TripPanel } from "./TripPanel";

type WorkspaceTrip = TripFull | PublicTrip;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function isPrivateTrip(trip: WorkspaceTrip): trip is TripFull {
  return "is_saved" in trip;
}

export function TripWorkspace({
  trip,
  budget,
  initialDay,
  readOnly = false,
}: {
  trip: WorkspaceTrip;
  budget: Budget | null;
  initialDay?: number;
  readOnly?: boolean;
}) {
  return (
    <TripWorkspaceContent
      key={trip.slug}
      trip={trip}
      budget={budget}
      initialDay={initialDay}
      readOnly={readOnly}
    />
  );
}

function TripWorkspaceContent({
  trip,
  budget,
  initialDay,
  readOnly,
}: {
  trip: WorkspaceTrip;
  budget: Budget | null;
  initialDay?: number;
  readOnly: boolean;
}) {
  const [currentTrip, setCurrentTrip] = useState<WorkspaceTrip>(trip);
  const [draftDocument, setDraftDocument] = useState<TripDocument>(trip.document);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const places = useMemo(() => draftDocument.places ?? [], [draftDocument.places]);
  const [focusPlaces, setFocusPlaces] = useState<Place[] | null>(null);
  const [selectedPlaceName, setSelectedPlaceName] = useState<string | null>(null);
  const isMobile = useIsMobile();

  function focus(next: Place[] | null) {
    setFocusPlaces(next);
    setSelectedPlaceName(selectedPlaceNameForFocus(next));
  }

  function selectPlace(place: Place) {
    setFocusPlaces([place]);
    setSelectedPlaceName(place.name);
  }

  function updateDocument(document: TripDocument) {
    setDraftDocument(document);
    setHasUnsavedChanges(true);
    setSaveError(null);
  }

  async function save() {
    if (readOnly || !isPrivateTrip(currentTrip)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const token = await getBrowserToken();
      if (!token) {
        setSaveError("Not signed in");
        return;
      }

      let nextTrip = currentTrip;
      if (hasUnsavedChanges) {
        nextTrip = await patchTripDocument(nextTrip.slug, draftDocument, token);
      }
      if (!nextTrip.is_saved) {
        nextTrip = await saveTrip(nextTrip.slug, token);
      }

      setCurrentTrip(nextTrip);
      setDraftDocument(nextTrip.document);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("save trip failed", error);
      setSaveError("Could not save");
    } finally {
      setSaving(false);
    }
  }

  const saved = !isPrivateTrip(currentTrip) || currentTrip.is_saved;
  const actions = !readOnly && isPrivateTrip(currentTrip) ? (
    <>
      <SaveTripButton
        saved={saved}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        error={saveError}
        onSave={save}
      />
      <PdfExportMenu
        slug={currentTrip.slug}
        destination={currentTrip.destination}
        days={currentTrip.days}
        prominent
      />
      <ShareMenu slug={currentTrip.slug} initialToken={currentTrip.share_token} />
    </>
  ) : undefined;
  const navMeta = readOnly ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      Shared
    </span>
  ) : null;

  const panel = (
    <TripPanel
      trip={currentTrip}
      budget={budget}
      readOnly={readOnly}
      initialDay={initialDay}
      selectedPlaceName={selectedPlaceName}
      onFocusPlaces={focus}
      document={draftDocument}
      onDocumentChange={updateDocument}
    />
  );

  return (
    <div className="flex h-dvh min-h-[520px] flex-col bg-[var(--color-paper-cream)]">
      <header className="z-30 flex min-h-14 items-center justify-between gap-3 border-b border-amber-700/10 bg-white/70 px-4 py-2 backdrop-blur-md">
        <Link href="/" className="shrink-0 text-sm font-medium text-ink-900 hover:text-amber-600">
          Atlas
        </Link>
        <div className="min-w-0 flex-1 text-center text-sm font-medium text-ink-700">
          <span className="block truncate">{currentTrip.destination}</span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {actions}
          {navMeta}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Map
          places={places}
          focusPlaces={focusPlaces}
          selectedPlaceName={selectedPlaceName}
          onPlaceClick={selectPlace}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,250,242,0.10),rgba(255,250,242,0.46)_68%,rgba(255,250,242,0.78))]"
          aria-hidden
        />
        <div className="absolute inset-y-4 right-4 z-20 hidden w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-[18px] border border-amber-700/10 bg-white/80 shadow-2xl backdrop-blur-md md:flex">
          {panel}
        </div>
        {isMobile && (
          <MobileSheet>{panel}</MobileSheet>
        )}
      </div>
    </div>
  );
}
