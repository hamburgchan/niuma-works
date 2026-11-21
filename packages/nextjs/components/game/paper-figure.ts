import * as THREE from "three";

/** Same outlined cutout treatment for employees and all three NPC colleagues. */
export function paperFigure(image: CanvasImageSource & { width: number; height: number }, height: number) {
  const pad = Math.max(6, Math.round(image.height / 90));
  const canvas = document.createElement("canvas");
  canvas.width = image.width + pad * 4;
  canvas.height = image.height + pad * 4;
  const mask = document.createElement("canvas");
  mask.width = canvas.width;
  mask.height = canvas.height;
  const m = mask.getContext("2d")!;
  m.imageSmoothingEnabled = false;
  m.drawImage(image, pad * 2, pad * 2);
  m.globalCompositeOperation = "source-in";
  m.fillStyle = "white";
  m.fillRect(0, 0, mask.width, mask.height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let x = -pad; x <= pad; x++)
    for (let y = -pad; y <= pad; y++) if (x * x + y * y <= pad * pad) ctx.drawImage(mask, x, y);
  ctx.drawImage(image, pad * 2, pad * 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  const width = (height * canvas.width) / canvas.height;
  const geometry = new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0);
  const figure = new THREE.Group();
  // Close parallel layers and a small lateral offset give the paper a visible edge.
  for (let i = 3; i >= 0; i--) {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      color: i === 0 ? 0xffffff : 0xb9b4a7,
    });
    const layer = new THREE.Mesh(geometry, material);
    layer.position.set(i * 0.009, 0, -i * 0.012);
    figure.add(layer);
  }
  return figure;
}

export function paperShadow(width = 1) {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 40),
    new THREE.MeshBasicMaterial({
      color: 0x34372c,
      transparent: true,
      opacity: 0.19,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(width, width * 0.48, 1);
  shadow.position.y = -0.045;
  return shadow;
}
