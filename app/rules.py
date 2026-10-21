from datetime import UTC, datetime, time


def access_reason(user, door: str, now: datetime | None = None) -> str:
    """Evaluate authorization independently from biometric verification."""
    if not user["active"]:
        return "USER_DISABLED"
    if door != user["door"]:
        return "DOOR_NOT_ALLOWED"
    # Fixed UTC+4 matches Baku; timezone objects avoid a Windows tzdata dependency.
    from datetime import timedelta, timezone

    local = (now or datetime.now(UTC)).astimezone(timezone(timedelta(hours=4)))
    current = local.time().replace(tzinfo=None)
    start, end = time.fromisoformat(user["start_time"]), time.fromisoformat(user["end_time"])
    # Equal endpoints mean all-day. Overnight windows are supported.
    inside = start == end or (
        start <= current < end if start < end else current >= start or current < end
    )
    return "GRANTED" if inside else "OUTSIDE_SCHEDULE"
