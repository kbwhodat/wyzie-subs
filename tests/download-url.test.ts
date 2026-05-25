import assert from "node:assert/strict";

import {
  getDownloadHost,
  rewriteDownloadUrl,
} from "../src/utils/download-url";

const requestUrl = new URL("http://localhost:3017/search?id=tt0111161");

assert.equal(getDownloadHost(requestUrl), "http://localhost:3017");
assert.equal(
  getDownloadHost(requestUrl, "https://subs.example.test/"),
  "https://subs.example.test",
);

assert.equal(
  rewriteDownloadUrl(
    {
      url: "subdl/BxjOpptdo9/252737-400383.zip",
      format: "srt",
      encoding: "UTF-8",
      source: "subdl",
    },
    "http://localhost:3017",
  ),
  "http://localhost:3017/c/BxjOpptdo9/id/252737-400383.subdl",
);

assert.equal(
  rewriteDownloadUrl(
    {
      url: "https://dl.opensubtitles.com/en/download/file/1954405905.gz?vrf-s7qqypo3",
      format: "srt",
      encoding: "UTF-8",
      source: "opensubtitles",
    },
    "http://localhost:3017",
  ),
  "http://localhost:3017/c/s7qqypo3/id/1954405905?format=srt&encoding=UTF-8",
);
