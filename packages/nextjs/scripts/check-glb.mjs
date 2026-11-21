// A post-start verification tool: GLTFLoader parses meshes and decodes embedded textures.
import { loadImage } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

globalThis.self = globalThis;
globalThis.ProgressEvent = class ProgressEvent {
  constructor(type, values) {
    this.type = type;
    Object.assign(this, values);
  }
};
globalThis.createImageBitmap = async source => loadImage(Buffer.from(await source.arrayBuffer()));

const path = process.argv[2];
if (!path) throw new Error("Pass the path to a newly generated/downloaded GLB");
const data = await readFile(path);
const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
const model = await new GLTFLoader().parseAsync(buffer, "");
let meshes = 0;
let textures = 0;
let vertices = 0;
model.scene.traverse(object => {
  if (!object.isMesh) return;
  meshes++;
  vertices += object.geometry.attributes.position.count;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) {
    if (!material.map) continue;
    if (!material.map.image?.width || !material.map.image?.height) throw new Error("Texture decoding failed");
    textures++;
  }
});
const size = new Box3().setFromObject(model.scene).getSize(new Vector3()).toArray();
if (!meshes || !vertices || size.some(value => !Number.isFinite(value))) throw new Error("No valid mesh geometry");
const result = {
  loader: "three@0.176.0 GLTFLoader",
  status: "PASS",
  bytes: data.length,
  sha256: createHash("sha256").update(data).digest("hex"),
  meshes,
  textures,
  vertices,
  size,
  animations: model.animations.length,
  scope: "Geometry parsing and texture decoding; no browser WebGL rendering claim",
};
console.log(JSON.stringify(result, null, 2));
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(result, null, 2) + "\n");
