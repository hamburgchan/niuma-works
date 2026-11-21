import { createKeyboardInput } from "../utils/game-input.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("held direction stays active across frames without OS key repeat", () => {
  const input = createKeyboardInput();
  input.down("ArrowRight", 0);
  for (let frame = 0; frame < 120; frame++) assert.equal(input.has("d", frame * 16.67), true);
  input.up("ArrowRight", 2000);
  assert.equal(input.has("d", 2001), false);
});
test("short tap gives a visible 120ms movement and then stops", () => {
  const input = createKeyboardInput();
  input.down("KeyW", 10);
  input.up("KeyW", 20);
  assert.equal(input.has("w", 110), true);
  assert.equal(input.has("w", 131), false);
});
test("blur clears both held keys and pending short taps", () => {
  const input = createKeyboardInput();
  input.down("KeyA", 10);
  input.clear(11);
  assert.equal(input.has("a", 11), false);
  assert.equal(input.has("a", 5000), false);
});
test("releasing WASD preserves the same direction held by an arrow key", () => {
  const input = createKeyboardInput();
  input.down("KeyW", 0);
  input.down("ArrowUp", 0);
  input.up("KeyW", 100);
  assert.equal(input.has("w", 1000), true);
  input.up("ArrowUp", 1000);
  assert.equal(input.has("w", 1001), false);
});
test("a tap entirely between slow frames still produces its complete movement", () => {
  const input = createKeyboardInput();
  input.clear(0);
  input.down("KeyW", 10);
  input.up("KeyW", 30);
  assert.deepEqual(input.consume(1000), { x: 0, z: -0.12 });
  assert.deepEqual(input.consume(2000), { x: 0, z: 0 });
});
test("held movement duration is identical at 50fps and 2fps", () => {
  function simulate(step) {
    const input = createKeyboardInput();
    input.clear(0);
    input.down("ArrowRight", 0);
    let x = 0;
    for (let time = step; time <= 2000; time += step) x += input.consume(time).x;
    return x;
  }
  assert.ok(Math.abs(simulate(20) - simulate(500)) < 1e-8);
  assert.equal(simulate(500), 2);
});
test("touch and keyboard use the same continuous movement integration", () => {
  const input = createKeyboardInput();
  input.clear(0);
  input.down("TouchD", 0);
  assert.equal(input.consume(1000).x, 1);
  input.up("TouchD", 1000);
  assert.equal(input.consume(2000).x, 0);
});
