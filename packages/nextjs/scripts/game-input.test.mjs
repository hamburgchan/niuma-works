import { createKeyboardInput } from "../utils/game-input.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("held direction stays active across frames without OS key repeat", () => {
  const input = createKeyboardInput();
  input.down("ArrowRight", 0);
  for (let frame = 0; frame < 120; frame++) assert.equal(input.has("d", frame * 16.67), true);
  input.up("ArrowRight");
  assert.equal(input.has("d", 2001), false);
});
test("short tap gives a visible 120ms movement and then stops", () => {
  const input = createKeyboardInput();
  input.down("KeyW", 10);
  input.up("KeyW");
  assert.equal(input.has("w", 110), true);
  assert.equal(input.has("w", 131), false);
});
test("blur clears both held keys and pending short taps", () => {
  const input = createKeyboardInput();
  input.down("KeyA", 10);
  input.clear();
  assert.equal(input.has("a", 11), false);
  assert.equal(input.has("a", 5000), false);
});
test("releasing WASD preserves the same direction held by an arrow key", () => {
  const input = createKeyboardInput();
  input.down("KeyW", 0);
  input.down("ArrowUp", 0);
  input.up("KeyW");
  assert.equal(input.has("w", 1000), true);
  input.up("ArrowUp");
  assert.equal(input.has("w", 1001), false);
});
