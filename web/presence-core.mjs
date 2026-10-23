// Only temporary geometry metadata. Never store camera images or face descriptors.
export function mergeTracks(records, result, notificationState) {
  if (notificationState.epoch !== result.tracking_epoch) {
    records.length = 0;
    notificationState.epoch = result.tracking_epoch;
    notificationState.lastId = 0;
  }
  const byId = new Map(records.map((r) => [r.id, r]));
  records.forEach((r) => {
    r.active = false;
  });
  for (const track of result.tracks) {
    let record = byId.get(track.id);
    if (!record) {
      record = { ...track };
      records.push(record);
      byId.set(track.id, record);
    }
    Object.assign(record, track, { active: true });
  }
  const fresh = [];
  for (const entry of result.arrivals) {
    if (entry.id > notificationState.lastId) fresh.push(entry);
  }
  notificationState.lastId = Math.max(
    notificationState.lastId,
    ...fresh.map((t) => t.id),
  );
  if (records.length > 500) records.splice(0, records.length - 500);
  return fresh;
}
