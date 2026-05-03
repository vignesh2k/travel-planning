"""Render a user profile into a one-paragraph context addendum the LLM
calls (research, hotels, augment) prepend to the brief's travel_style.
"""

from api.models import UserProfile


def profile_addendum(profile: UserProfile | None) -> str:
    if not profile:
        return ""
    parts: list[str] = []
    if profile.diet:
        parts.append(profile.diet)
    if profile.budget:
        parts.append(f"{profile.budget} budget")
    if profile.pace:
        parts.append(f"{profile.pace} pace")
    if profile.interests:
        parts.append("Interests: " + ", ".join(profile.interests))
    if profile.notes:
        parts.append(profile.notes)
    return ". ".join(parts)
