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

  return Object.fromEntries(
    Object.entries({ ...defaultHeaders, ...extraHeaders }).filter(([, value]) => value !== null),
  ) as Record<string, string>;
};

export async function createProxyToken(userAgent: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(userAgent),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function proxyFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const defaultHeaders = getHeaders(userAgent);
    const headers = {
      ...defaultHeaders,
      ...options?.headers,
    };
    const fetchOptions: RequestInit = {
      ...options,
      headers,
    };

    const proxyUrl = process.env.PROXY_URL?.replace(/\/+$/, "");
    const proxySecret = process.env.PROXY_SECRET;

    if (proxyUrl && proxySecret) {
      const proxyRequestUrl = new URL(proxyUrl);
      proxyRequestUrl.searchParams.set("url", url);
      proxyRequestUrl.searchParams.set("normal", "1");
      proxyRequestUrl.searchParams.set("headers", JSON.stringify(headers));

      console.log(`[Proxy Fetch] Fetching URL through proxy: ${url}`);
      return fetch(proxyRequestUrl.toString(), {
        ...fetchOptions,
        headers: {
          "User-Agent": userAgent,
          "API-Token": await createProxyToken(userAgent, proxySecret),
        },
      });
    }

    console.log(`[Direct Fetch] Fetching URL: ${url}`);
    return fetch(url, fetchOptions);
  } catch (e) {
    console.error("Fetch error:", e);
    throw new Error(`Fetch request failed: ${e.message}`);
  }
}
