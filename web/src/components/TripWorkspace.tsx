"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { patchTripDocument, saveTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import { selectedPlaceNameForFocus } from "@/lib/map-focus";
import type { Budget, Place, PublicTrip, TripDocument, TripFull } from "@/lib/types";
import { isSheetTab, tabsForWorkspace, type WorkspaceTab } from "@/lib/workspace-tabs";

import { BrandMark } from "./BrandMark";
import { Map } from "./Map";
import { MobileWorkspaceNav } from "./MobileWorkspaceNav";
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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("Plan");
  const visibleTabs = tabsForWorkspace({ readOnly, isMobile });

  function focus(next: Place[] | null) {
    setFocusPlaces(next);
    setSelectedPlaceName(selectedPlaceNameForFocus(next));
  }

  function changeWorkspaceTab(next: WorkspaceTab) {
    setWorkspaceTab(next);
    if (next !== "Plan") focus(null);
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
      activeTab={workspaceTab}
      isMobile={isMobile}
      onTabChange={changeWorkspaceTab}
      initialDay={initialDay}
      selectedPlaceName={selectedPlaceName}
      onFocusPlaces={focus}
      document={draftDocument}
      onDocumentChange={updateDocument}
    />
  );

  return (
    <div className="flex h-dvh min-h-[520px] flex-col bg-[var(--color-paper-cream)]">
      <header className="z-30 grid min-h-14 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-amber-700/10 bg-white/75 px-3 py-2 backdrop-blur-md sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-4">
        <Link href="/" className="contents" aria-label="Atlas home">
          <BrandMark />
        </Link>
        <div className="min-w-0 text-right text-sm font-medium text-ink-700 sm:text-center">
          <span className="block truncate">{currentTrip.destination}</span>
        </div>
        <div className="col-span-2 flex min-w-0 items-center justify-end gap-1.5 overflow-x-auto pb-0.5 sm:col-span-1 sm:overflow-visible sm:pb-0">
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
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,250,242,0.78),rgba(255,250,242,0.46)_32%,rgba(255,250,242,0.10))]"
          aria-hidden
        />
        {!isMobile && (
          <div className="absolute inset-y-4 left-4 z-20 hidden w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-[18px] border border-amber-700/10 bg-white/80 shadow-2xl backdrop-blur-md md:flex">
            {panel}
          </div>
        )}
        {isMobile && isSheetTab(workspaceTab) && (
          <MobileSheet>{panel}</MobileSheet>
        )}
        {isMobile && (
          <MobileWorkspaceNav
            tabs={visibleTabs}
            active={workspaceTab}
            onChange={changeWorkspaceTab}
          />
        )}
      </div>
    </div>
  );
}
