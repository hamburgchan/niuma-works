"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createKeyboardInput } from "~~/utils/game-input";
import type { RunResult } from "~~/utils/niuma";

type Props = {
  url: string;
  sha256: string;
  playing: boolean;
  runKey: number;
  motion: "waddle" | "hop";
  finishSignal: number;
  onReady: () => void;
  onFinish: (result: RunResult) => void;
};
const STAR_POSITIONS = [
  [-4, -3],
  [3, -4],
  [5, 2],
  [1, 5],
  [-4, 4],
  [-6, 0],
];

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 + Math.PI / 2;
    const radius = i % 2 ? 0.18 : 0.38;
    const x = Math.cos(angle) * radius,
      y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
}

export function Arena(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef(new Set<string>());
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
    renderer.domElement.setAttribute("aria-label", "3D 收星场地，使用方向键或屏幕方向按钮移动");
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
    let model: THREE.Group | undefined;
    const stars = STAR_POSITIONS.map(([x, z]) => {
      const mesh = new THREE.Mesh(
        starGeometry(),
        new THREE.MeshStandardMaterial({ color: 0xf6c651, roughness: 0.6, metalness: 0.12 }),
      );
      mesh.position.set(x, 0.7, z);
      mesh.castShadow = true;
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
    const keyboard = createKeyboardInput();
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
      keyboard.up(event.code);
    };
    const clear = () => {
      controls.current.clear();
      keyboard.clear();
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
        if (!response.ok) throw new Error("GLB 下载失败");
        const bytes = await response.arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
          .map(v => v.toString(16).padStart(2, "0"))
          .join("");
        if (digest !== props.sha256.replace(/^0x/, "")) throw new Error("文件 SHA-256 与链上记录不一致，已停止载入");
        const gltf = await new GLTFLoader().parseAsync(bytes, "");
        if (disposed) return;
        model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model),
          size = box.getSize(new THREE.Vector3()),
          center = box.getCenter(new THREE.Vector3());
        model.scale.setScalar(1.6 / Math.max(size.y, 0.01));
        model.position.set(-center.x * model.scale.x, -box.min.y * model.scale.y, -center.z * model.scale.z);
        model.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
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
      if (state.playing && run.current.key !== state.runKey) {
        run.current = { key: state.runKey, start: time, ended: false, stars: 0, signal: state.finishSignal };
        actor.position.set(0, 0, 0);
        stars.forEach(star => (star.visible = true));
        setHud({ stars: 0, seconds: 60 });
      }
      let moving = false;
      if (state.playing && !run.current.ended) {
        const keys = controls.current;
        const x = Number(keys.has("d") || keyboard.has("d", time)) - Number(keys.has("a") || keyboard.has("a", time));
        const z = Number(keys.has("s") || keyboard.has("s", time)) - Number(keys.has("w") || keyboard.has("w", time));
        moving = !!(x || z);
        if (moving) {
          const direction = new THREE.Vector3(x, 0, z).normalize();
          actor.position.addScaledVector(direction, dt * 4.3);
          actor.position.x = THREE.MathUtils.clamp(actor.position.x, -7.7, 7.7);
          actor.position.z = THREE.MathUtils.clamp(actor.position.z, -7.7, 7.7);
          actor.rotation.y = Math.atan2(direction.x, direction.z);
        }
        for (const star of stars) {
          if (
            star.visible &&
            Math.hypot(star.position.x - actor.position.x, star.position.z - actor.position.z) < 0.85
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
        model.rotation.z = moving && state.motion === "waddle" ? Math.sin(time * 0.016) * 0.13 : 0;
        actor.position.y = moving && state.motion === "hop" ? Math.abs(Math.sin(time * 0.012)) * 0.25 : 0;
      }
      for (const star of stars) star.rotation.y = time * 0.001;
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
  }, [props.url, props.sha256]);

  const direction = (key: string, label: string) => (
    <button
      type="button"
      className={`direction direction-${key}`}
      aria-label={label}
      onPointerDown={event => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        controls.current.add(key);
      }}
      onPointerUp={() => controls.current.delete(key)}
      onPointerCancel={() => controls.current.delete(key)}
      onLostPointerCapture={() => controls.current.delete(key)}
    >
      {{ w: "↑", a: "←", s: "↓", d: "→" }[key]}
    </button>
  );
  return (
    <div className="arena-wrap">
      <div ref={host} className="arena-canvas" />
      <div className="arena-hud">
        <span>
          ★ {hud.stars}
          <small> / 6</small>
        </span>
        <span>
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
