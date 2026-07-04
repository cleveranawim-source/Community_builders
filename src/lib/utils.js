export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `u${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
