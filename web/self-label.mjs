export class SelfLabel {
  constructor() {
    this.clear();
  }
  clear() {
    this.id = null;
    this.name = null;
    this.until = 0;
  }
  accept(result, tracks, now) {
    this.clear();
    if (
      result.verified &&
      typeof result.name === "string" &&
      tracks.length === 1
    ) {
      this.id = tracks[0].id;
      this.name = result.name.toUpperCase();
      this.until = now + 2500;
    }
  }
  label(tracks, id, now) {
    if (tracks.length !== 1 || tracks[0].id !== this.id || now >= this.until) {
      this.clear();
      return null;
    }
    return id === this.id ? this.name : null;
  }
}
