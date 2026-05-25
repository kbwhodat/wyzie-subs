/** @format */

import { USER_AGENTS } from "~/utils/userAgents";

const getHeaders = (userAgent: string, extraHeaders: Record<string, string> = {}) => {
  const isMobile = userAgent.includes("Mobile") || userAgent.includes("Android");
  const isWindows = userAgent.includes("Windows");
  const isMac = userAgent.includes("Macintosh");
  const isLinux = userAgent.includes("Linux");

  let chromeVersion = "137";
  const chromeMatch = userAgent.match(/Chrome\/([0-9]+)/);
  if (chromeMatch && chromeMatch[1]) {
    chromeVersion = chromeMatch[1];
  }

  const defaultHeaders = {
    "User-Agent": userAgent,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Ch-Ua":
      userAgent.includes("Chrome") ?
        `"Chromium";v="${chromeVersion}", "Not(A:Brand";v="24", "Google Chrome";v="${chromeVersion}"`
      : null,
    "Sec-Ch-Ua-Mobile": isMobile ? "?1" : "?0",
    "Sec-Ch-Ua-Platform": `"${
      isMobile && !isWindows && !isMac ? "Android"
      : isWindows ? "Windows"
      : isMac ? "macOS"
      : isLinux ? "Linux"
      : "Unknown"
    }"`,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Cache-Control": "max-age=0",
    Connection: "keep-alive",
  };

  return { ...defaultHeaders, ...extraHeaders };
};

export async function proxyFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    // Direct fetch without proxy for local development
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const defaultHeaders = getHeaders(userAgent);

    const fetchOptions = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options?.headers,
      },
    };

    console.log(`[Direct Fetch] Fetching URL: ${url}`);
    return fetch(url, fetchOptions);
  } catch (e) {
    console.error("Fetch error:", e);
    throw new Error(`Fetch request failed: ${e.message}`);
  }
}
