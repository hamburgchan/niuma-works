"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

export function PaperPreview({
  url,
  sha256,
  name,
  onVerified,
  proofCollapsed = false,
}: {
  url: string;
  sha256: string;
  name: string;
  onVerified?: (valid: boolean) => void;
  proofCollapsed?: boolean;
}) {
  const [state, setState] = useState({ image: "", message: "正在下载透明 PNG 并核对文件指纹…", valid: false });
  useEffect(() => {
    const abort = new AbortController();
    let objectUrl = "";
    setState({ image: "", message: "正在核对链上文件指纹…", valid: false });
    onVerified?.(false);
    void (async () => {
      try {
        const response = await fetch(
          url.includes("blob.vercel-storage.com") ? `/chars/${sha256.replace(/^0x/, "")}.png` : url,
          { signal: abort.signal },
        ).catch(() => null);
        if (!response) throw new Error("PNG 暂时无法下载");
        if (!response.ok) throw new Error("PNG 暂时无法下载");
        const bytes = await response.arrayBuffer();
        const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map(v => v.toString(16).padStart(2, "0"))
          .join("");
        if (digest !== sha256.replace(/^0x/, "")) throw new Error("文件指纹与链上记录不一致");
        if (
          [...new Uint8Array(bytes.slice(0, 8))].map(v => v.toString(16).padStart(2, "0")).join("") !==
          "89504e470d0a1a0a"
        )
          throw new Error("交付文件不是 PNG，暂不开放验收");
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let transparent = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 16) transparent++;
        if (transparent / (canvas.width * canvas.height) < 0.18) {
          setState({ image: objectUrl, message: "✓ SHA-256 一致；透明背景不足，暂不开放验收", valid: false });
          onVerified?.(false);
          return;
        }
        if (abort.signal.aborted) return;
        setState({ image: objectUrl, message: "✓ 浏览器 SHA-256 与链上交付一致", valid: true });
        onVerified?.(true);
      } catch (error) {
        if (!abort.signal.aborted)
          setState({ image: "", message: error instanceof Error ? error.message : "校验失败", valid: false });
      }
    })();
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, sha256, onVerified]);
  return (
    <div className="paper-preview">
      <div className="paper-image">
        {state.image && <Image src={state.image} alt={name} width={263} height={512} unoptimized />}
      </div>
      {!proofCollapsed && (
        <p className={state.valid ? "hash-pass" : "small-note"} role="status">
          {state.message}
        </p>
      )}
    </div>
  );
}
