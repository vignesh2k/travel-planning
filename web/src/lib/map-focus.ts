type FocusablePlace = { name: string };

export function selectedPlaceNameForFocus(places: FocusablePlace[] | null): string | null {
  return places?.length === 1 ? places[0].name : null;
}
