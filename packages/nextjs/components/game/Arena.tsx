"use client";

import { useEffect, useRef, useState } from "react";
import { paperFigure, paperShadow } from "./paper-figure";
import * as THREE from "three";
import { createKeyboardInput } from "~~/utils/game-input";
import type { RunResult } from "~~/utils/niuma";

type Props = {
  url: string;
  sha256: string;
  playing: boolean;
  runKey: number;
  motion: "waddle" | "hop" | "squash";
  finishSignal: number;
  onReady: () => void;
  onFinish: (result: RunResult) => void;
  employeeName: string;
  characterId: number;
};
const STAR_POSITIONS = [
  [-4, -3],
  [3, -4],
  [5, 2],
  [1, 5],
  [-4, 4],
  [-6, 0],
];

function labelTexture(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#292d25";
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = "#fff5d9";
  ctx.fillRect(5, 5, 502, 86);
  ctx.fillStyle = "#292d25";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 49, 480);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function paperTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 80;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#292d25";
  ctx.fillRect(7, 3, 66, 90);
  ctx.fillStyle = "#fff8df";
  ctx.fillRect(11, 7, 58, 82);
  ctx.fillStyle = "#e9bd56";
  ctx.fillRect(45, 7, 24, 20);
  ctx.fillStyle = "#777b62";
  for (let i = 0; i < 4; i++) ctx.fillRect(20, 36 + i * 11, i === 3 ? 25 : 40, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function Arena(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef(createKeyboardInput());
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  const [error, setError] = useState("");
  const [hud, setHud] = useState({ stars: 0, seconds: 60 });
  const [ready, setReady] = useState(false);
  const run = useRef({ key: -1, start: 0, ended: false, stars: 0, signal: 0 });

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false,
      frame = 0;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError("此浏览器无法启动 3D 渲染，请在支持 WebGL 的浏览器打开。");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "3D 打工工坊，使用方向键或屏幕方向按钮移动并领取工单");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eee9db");
    scene.fog = new THREE.Fog("#eee9db", 18, 38);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x77805c, 2.7));
    const sun = new THREE.DirectionalLight(0xffffff, 3.2);
    sun.position.set(-4, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(17, 0.35, 17),
      new THREE.MeshStandardMaterial({ color: 0xc4d7ac, roughness: 1 }),
    );
    ground.position.y = -0.24;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(16, 16, 0xa5b793, 0xb5c89f);
    grid.position.y = -0.055;
    scene.add(grid);
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x8f9f7b });
    for (const [x, z, sx, sz] of [
      [0, -8.5, 17.4, 0.2],
      [0, 8.5, 17.4, 0.2],
      [-8.5, 0, 0.2, 17.4],
      [8.5, 0, 0.2, 17.4],
    ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.28, sz), edgeMaterial);
      rail.position.set(x, 0.02, z);
      scene.add(rail);
    }
    const actor = new THREE.Group();
    scene.add(actor);
    const shadow = paperShadow(1.1);
    scene.add(shadow);
    const colleagues: THREE.Group[] = [];
    const badge = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: labelTexture(`${props.employeeName}  #${props.characterId}`), depthTest: false }),
    );
    badge.scale.set(2.6, 0.49, 1);
    badge.position.y = 2.05;
    actor.add(badge);
    for (const [i, pet] of ["donkey", "horse", "cow"].entries()) {
      new THREE.TextureLoader().load(`/pets/${pet}.png`, map => {
        if (disposed) {
          map.dispose();
          return;
        }
        const colleague = paperFigure(map.image, 2.4);
        map.dispose();
        colleague.position.set(-6 + i * 6, 0, -6.5);
        colleagues.push(colleague);
        scene.add(colleague);
        const colleagueShadow = paperShadow(1.5);
        colleagueShadow.position.set(-6 + i * 6, -0.045, -6.5);
        scene.add(colleagueShadow);
      });
      const title = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: labelTexture(["驴 · 造身体", "马 · 教走路", "牛 · 发工牌"][i]) }),
      );
      title.scale.set(2.25, 0.42, 1);
      title.position.set(-6 + i * 6, 2.7, -6.5);
      scene.add(title);
    }
    let model: THREE.Group | undefined;
    const documentTexture = paperTexture();
    const stars = STAR_POSITIONS.map(([x, z]) => {
      const mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: documentTexture }));
      mesh.scale.set(0.7, 0.84, 1);
      mesh.position.set(x, 0.7, z);
      scene.add(mesh);
      return mesh;
    });
    const resize = () => {
      const width = element.clientWidth,
        height = element.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const keyboard = controls.current;
    keyboard.clear(performance.now());
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (keyboard.down(event.code, performance.now())) {
        event.preventDefault();
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      keyboard.up(event.code, performance.now());
    };
    const clear = () => {
      keyboard.clear(performance.now());
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    const abort = new AbortController();
    async function load() {
      try {
        const response = await fetch(props.url, { signal: abort.signal });
        if (!response.ok) throw new Error("透明 PNG 下载失败");
        const bytes = await response.arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
          .map(v => v.toString(16).padStart(2, "0"))
          .join("");
        if (digest !== props.sha256.replace(/^0x/, "")) throw new Error("文件 SHA-256 与链上记录不一致，已停止载入");
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        if (disposed) {
          bitmap.close();
          return;
        }
        model = paperFigure(bitmap, 1.8);
        bitmap.close();
        actor.add(model);
        setReady(true);
        latest.current.onReady();
      } catch (error) {
        if (!disposed) setError(error instanceof Error ? error.message : "角色载入失败");
      }
    }
    void load();
    let previous = performance.now(),
      lastHud = 0;
    function end(time: number) {
      if (run.current.ended) return;
      run.current.ended = true;
      latest.current.onFinish({
        stars: run.current.stars,
        timeMs: Math.max(1, Math.min(60000, Math.round(time - run.current.start))),
      });
    }
    const animate = (time: number) => {
      if (disposed) return;
      const dt = Math.min((time - previous) / 1000, 0.05);
      previous = time;
      const state = latest.current;
      const movement = keyboard.consume(time);
      if (state.playing && run.current.key !== state.runKey) {
        run.current = { key: state.runKey, start: time, ended: false, stars: 0, signal: state.finishSignal };
        actor.position.set(0, 0, 0);
        stars.forEach(star => (star.visible = true));
        setHud({ stars: 0, seconds: 60 });
      }
      let moving = false;
      if (state.playing && !run.current.ended) {
        const beforeX = actor.position.x,
          beforeZ = actor.position.z;
        const { x, z } = movement;
        moving = !!(x || z);
        if (moving) {
          const direction = new THREE.Vector3(x, 0, z);
          actor.position.addScaledVector(direction, 4.3);
          actor.position.x = THREE.MathUtils.clamp(actor.position.x, -7.7, 7.7);
          actor.position.z = THREE.MathUtils.clamp(actor.position.z, -7.7, 7.7);
        }
        for (const star of stars) {
          const dx = actor.position.x - beforeX,
            dz = actor.position.z - beforeZ,
            lengthSquared = dx * dx + dz * dz;
          const t = lengthSquared
            ? THREE.MathUtils.clamp(
                ((star.position.x - beforeX) * dx + (star.position.z - beforeZ) * dz) / lengthSquared,
                0,
                1,
              )
            : 0;
          if (
            star.visible &&
            Math.hypot(star.position.x - (beforeX + dx * t), star.position.z - (beforeZ + dz * t)) < 0.85
          ) {
            star.visible = false;
            run.current.stars++;
          }
        }
        if (time - lastHud > 90) {
          setHud({ stars: run.current.stars, seconds: Math.max(0, Math.ceil(60 - (time - run.current.start) / 1000)) });
          lastHud = time;
        }
        if (run.current.stars === 6 || time - run.current.start >= 60000 || state.finishSignal !== run.current.signal)
          end(time);
      }
      if (model) {
        model.quaternion.copy(camera.quaternion);
        model.rotateZ(moving && state.motion === "waddle" ? Math.sin(time * 0.016) * 0.1 : 0);
        const bounce = Math.abs(Math.sin(time * 0.012));
        model.position.y = moving
          ? state.motion === "waddle"
            ? Math.abs(Math.sin(time * 0.016)) * 0.035
            : bounce * 0.22
          : 0;
        const squash = moving && state.motion === "squash" ? Math.max(0, 1 - bounce * 4) * 0.17 : 0;
        model.scale.set(1 + squash, 1 - squash, 1);
      }
      shadow.position.x = actor.position.x;
      shadow.position.z = actor.position.z;
      for (const colleague of colleagues) colleague.quaternion.copy(camera.quaternion);
      for (const star of stars) star.position.y = 0.7 + Math.sin(time * 0.003 + star.position.x) * 0.08;
      camera.position.lerp(new THREE.Vector3(actor.position.x, 7.5, actor.position.z + 10), Math.min(1, dt * 6));
      camera.lookAt(actor.position.x, 0.4, actor.position.z);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    camera.position.set(0, 7.5, 10);
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      clear();
      scene.traverse(object => {
        if (object instanceof THREE.Sprite) {
          object.material.map?.dispose();
          object.material.dispose();
        }
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
            material.dispose();
          }
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [props.url, props.sha256, props.employeeName, props.characterId]);

  const direction = (key: string, label: string) => (
    <button
      type="button"
      className={`direction direction-${key}`}
      aria-label={label}
      onPointerDown={event => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        controls.current.down(`Touch${key.toUpperCase()}`, performance.now());
      }}
      onPointerUp={() => controls.current.up(`Touch${key.toUpperCase()}`, performance.now())}
      onPointerCancel={() => controls.current.up(`Touch${key.toUpperCase()}`, performance.now())}
      onLostPointerCapture={() => controls.current.up(`Touch${key.toUpperCase()}`, performance.now())}
    >
      {{ w: "↑", a: "←", s: "↓", d: "→" }[key]}
    </button>
  );
  return (
    <div className="arena-wrap">
      <div ref={host} className="arena-canvas" />
      <div className="arena-hud">
        <span>
          ▤ {hud.stars}
          <small> / 6 单</small>
        </span>
        <span>
          <small>下班倒计时 </small>
          {hud.seconds}
          <small> 秒</small>
        </span>
      </div>
      {!ready && !error && (
        <div className="arena-loading" role="status">
          正在下载角色并核对链上 SHA-256…
        </div>
      )}
      {error && (
        <div className="arena-loading error" role="alert">
          {error}
        </div>
      )}
      <div className="direction-pad" aria-label="屏幕方向控制">
        {direction("w", "向前移动")}
        {direction("a", "向左移动")}
        {direction("s", "向后移动")}
        {direction("d", "向右移动")}
      </div>
      <span className="arena-instruction">WASD / 方向键 / 屏幕方向按钮</span>
    </div>
  );
}
