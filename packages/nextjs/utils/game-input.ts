const CODES: Record<string, string> = {
  ArrowUp: "w",
  ArrowDown: "s",
  ArrowLeft: "a",
  ArrowRight: "d",
  KeyW: "w",
  KeyA: "a",
  KeyS: "s",
  KeyD: "d",
};
export function createKeyboardInput() {
  const held = new Set<string>(),
    taps = new Map<string, number>();
  return {
    down(code: string, time: number) {
      const key = CODES[code];
      if (!key) return false;
      if (!held.has(code)) taps.set(code, time + 120);
      held.add(code);
      return true;
    },
    up(code: string) {
      held.delete(code);
    },
    clear() {
      held.clear();
      taps.clear();
    },
    has(key: string, time: number) {
      return Object.keys(CODES).some(code => CODES[code] === key && (held.has(code) || (taps.get(code) || 0) > time));
    },
  };
}
