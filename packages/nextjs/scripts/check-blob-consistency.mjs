import { get, head } from "@vercel/blob";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

Object.assign(process.env, parseEnv(readFileSync("../../../.env", "utf8")));
const path = "niuma/0x8ecf351db2ea99aa32bef4ba2686fd0bfeff8abb/live/events-v1.json";
const meta = await head(path);
for (const variant of [meta.url, `${meta.url}?v=${encodeURIComponent(meta.etag)}`]) {
  const blob = await get(variant, { access: "public", useCache: false });
  const data = JSON.parse(await new Response(blob.stream).text());
  console.log(
    JSON.stringify({
      variant: variant.includes("?") ? "etag-query" : "plain",
      headEtag: meta.etag,
      readEtag: blob.blob.etag,
      cursor: data.cursor,
    }),
  );
}
