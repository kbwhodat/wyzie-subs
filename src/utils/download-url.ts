/** @format */

import type { ResponseType } from "~/utils/types";

type DownloadUrlItem = Pick<ResponseType, "url" | "format" | "encoding" | "source">;

export function getDownloadHost(requestUrl: URL, publicHost = process.env.SUBTITLE_PUBLIC_HOST) {
  const configuredHost = publicHost?.trim();
  const host = configuredHost && configuredHost.length > 0 ? configuredHost : requestUrl.origin;

  return host.replace(/\/+$/, "");
}

export function rewriteDownloadUrl(item: DownloadUrlItem, host: string) {
  const originalUrl = item.url;

  if (item.source === "subdl") {
    const [source, id, filename] = originalUrl.split("/");
    if (source === "subdl" && id && filename) {
      const pseudoVrf = id;
      const cleanFilename = filename.endsWith(".zip") ? filename.slice(0, -4) : filename;
      const downloadId = cleanFilename.includes("-") ? cleanFilename : `${id}-${cleanFilename}`;
      return `${host}/c/${pseudoVrf}/id/${downloadId}.subdl`;
    }

    return originalUrl;
  }

  const vrfMatch = originalUrl.match(/vrf-([a-z0-9]+)/);
  const fileIdMatch = originalUrl.match(/file\/(\d+)/);
  if (vrfMatch && vrfMatch[1] && fileIdMatch && fileIdMatch[1]) {
    const vrf = vrfMatch[1];
    const fileId = fileIdMatch[1];
    const formatParam = item.format ? `format=${encodeURIComponent(item.format)}` : "";
    const encodingParam = item.encoding ? `encoding=${encodeURIComponent(item.encoding)}` : "";
    const queryParams = [formatParam, encodingParam].filter(Boolean).join("&");
    return `${host}/c/${vrf}/id/${fileId}${queryParams ? "?" + queryParams : ""}`;
  }

  return originalUrl;
}
