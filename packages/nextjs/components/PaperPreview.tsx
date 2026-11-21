"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

export function PaperPreview({ url, sha256, name }: { url: string; sha256: string; name: string }) {
  const [state, setState] = useState({ image: "", message: "正在下载透明 PNG 并核对文件指纹…", valid: false });
  useEffect(() => {
    const abort = new AbortController();
    let objectUrl = "";
    setState({ image: "", message: "正在核对链上文件指纹…", valid: false });
    void (async () => {
      try {
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok) throw new Error("PNG 暂时无法下载");
        const bytes = await response.arrayBuffer();
        const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map(v => v.toString(16).padStart(2, "0"))
          .join("");
        if (digest !== sha256.replace(/^0x/, "")) throw new Error("文件指纹与链上记录不一致");
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        setState({ image: objectUrl, message: "✓ 浏览器 SHA-256 与链上交付一致", valid: true });
      } catch (error) {
        if (!abort.signal.aborted)
          setState({ image: "", message: error instanceof Error ? error.message : "校验失败", valid: false });
      }
    })();
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, sha256]);
  return (
    <div className="paper-preview">
      <div className="paper-image">
        {state.image && <Image src={state.image} alt={name} width={263} height={512} unoptimized />}
      </div>
      <p className={state.valid ? "hash-pass" : "small-note"} role="status">
        {state.message}
      </p>
    </div>
  );
}
