const CODES: Record<string, string> = {
  ArrowUp: "w",
  ArrowDown: "s",
  ArrowLeft: "a",
  ArrowRight: "d",
  KeyW: "w",
  KeyA: "a",
  KeyS: "s",
  KeyD: "d",
  TouchW: "w",
  TouchA: "a",
  TouchS: "s",
  TouchD: "d",
};
export function createKeyboardInput() {
  const held = new Map<string, number>();
  let released: { code: string; start: number; end: number }[] = [];
  let previous = 0;
  return {
    down(code: string, time: number) {
      if (!CODES[code]) return false;
      if (!held.has(code)) held.set(code, time);
      return true;
    },
    up(code: string, time = performance.now()) {
      const start = held.get(code);
      if (start !== undefined) released.push({ code, start, end: Math.max(time, start + 120) });
      held.delete(code);
    },
    clear(time = performance.now()) {
      held.clear();
      released = [];
      previous = time;
    },
    has(key: string, time: number) {
      return Object.keys(CODES).some(
        code =>
          CODES[code] === key &&
          ((held.has(code) && held.get(code)! <= time) ||
            released.some(item => item.code === code && item.start <= time && item.end > time)),
      );
    },
    consume(time: number) {
      const duration = (key: string) => {
        const intervals = [...released, ...Array.from(held, ([code, start]) => ({ code, start, end: time }))]
          .filter(item => CODES[item.code] === key)
          .map(item => ({ start: Math.max(previous, item.start), end: Math.min(time, item.end) }))
          .filter(item => item.end > item.start)
          .sort((a, b) => a.start - b.start);
        let total = 0,
          end = -Infinity;
        for (const item of intervals) {
          total += Math.max(0, item.end - Math.max(end, item.start));
          end = Math.max(end, item.end);
        }
        return total / 1000;
      };
      let x = duration("d") - duration("a"),
        z = duration("s") - duration("w");
      const seconds = Math.max(0, (time - previous) / 1000),
        length = Math.hypot(x, z);
      if (length > seconds && length > 0) {
        x = (x / length) * seconds;
        z = (z / length) * seconds;
      }
      previous = time;
      released = released.filter(item => item.end > time);
      return { x, z };
    },
  };
}
