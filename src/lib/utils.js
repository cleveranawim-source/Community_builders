export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `u${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// 받침 유무에 따라 조사를 고른다. 예: josa("준", "과", "와") → "과"
export function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return withoutFinal;
  return (code - 0xac00) % 28 ? withFinal : withoutFinal;
}
