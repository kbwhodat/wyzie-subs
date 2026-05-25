/** @format */

import type { RequestType, ResponseType, SubdlPageProps } from "~/utils/types";
import { languageToCountryCode } from "~/utils/lookup";
import { numberToCardinal } from "~/utils/utils";
import { proxyFetch } from "~/utils/proxy";
import ISO6391 from "iso-639-1";

const TMDB_API_KEY = "9867f3f6a5e78a2639afb0e2ffc0a311";

type SubdlSearchResult = {
  type: "movie" | "tv";
  sd_id: string;
  name: string;
  original_name?: string;
  poster_url: string;
  year: number;
  slug: string;
  subtitles_count: number;
};

async function fetchViaSubdlProxy(url: string, headers: Record<string, string> = {}) {
  return typeof proxyFetch === "function" ? proxyFetch(url, { headers }) : fetch(url, { headers });
}

async function getSubdlBuildId(): Promise<string> {
  const response = await fetchViaSubdlProxy("https://subdl.com/", {
    referer: "https://subdl.com/",
  });

  if (!response.ok) {
    throw new Error(`SubDL homepage request failed with status ${response.status}`);
  }

  const html = await response.text();
  const nextData = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );

  if (!nextData || !nextData[1]) {
    throw new Error("SubDL homepage did not include __NEXT_DATA__ build metadata");
  }

  const parsed = JSON.parse(nextData[1]) as { buildId?: string };
  if (!parsed.buildId) {
    throw new Error("SubDL __NEXT_DATA__ did not include a buildId");
  }

  return parsed.buildId;
}

async function getTitleForImdbId(imdbId: string, isTvShow: boolean): Promise<string | null> {
  const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
  const response = await fetch(url);

  if (!response.ok) {
    console.warn(`[SubDL Source] TMDB lookup failed with status ${response.status}`);
    return null;
  }

  const data = await response.json();
  const result = isTvShow ? data.tv_results?.[0] : data.movie_results?.[0];

  return result?.title || result?.name || result?.original_title || result?.original_name || null;
}

async function searchSubdlTitle(query: string): Promise<SubdlSearchResult[]> {
  const searchUrl = `https://apiold.subdl.com/search?query=${encodeURIComponent(query)}`;
  const response = await fetchViaSubdlProxy(searchUrl, {
    referer: `https://subdl.com/search/${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`SubDL search API request failed with status ${response.status}`);
  }

  const searchData = (await response.json()) as { results?: SubdlSearchResult[] };

  return searchData.results || [];
}

export async function searchSubdl(request: RequestType): Promise<ResponseType[]> {
  console.log(`[SubDL Source] Searching with parameters:`, {
    imdbId: request.imdbId,
    season: request.season,
    episode: request.episode,
    languages: request.languages,
    formats: request.formats,
    encodings: request.encodings,
    hearingImpaired: request.hearingImpaired,
  });

  try {
    const buildId = await getSubdlBuildId();
    const isTvShowRequest = request.season !== undefined && request.episode !== undefined;
    const title = await getTitleForImdbId(request.imdbId, isTvShowRequest);
    const searchResults = await searchSubdlTitle(title || request.imdbId);
    const filteredSearchResults = searchResults.filter((result) =>
      isTvShowRequest ? result.type === "tv" : result.type === "movie",
    );
    const searchResultItem = filteredSearchResults[0] || searchResults[0];

    if (!searchResultItem) {
      console.log(`[SubDL Source] No results found for IMDb ID: ${request.imdbId}`);
      return [];
    }

    const headers = {
      referer: `https://subdl.com/subtitle/${searchResultItem.sd_id}/${searchResultItem.slug}`,
      "x-nextjs-data": "1",
    };
    let finalSubtitleApiUrl = "";
    let finalReferer = "";
    let seasonSlug: string | null = null;

    if (searchResultItem.type === "movie") {
      console.log(`[SubDL Source] Movie detected.`);
      finalSubtitleApiUrl = `https://subdl.com/_next/data/${buildId}/subtitle/${searchResultItem.sd_id}/${searchResultItem.slug}.json?slug=${searchResultItem.sd_id}&slug=${searchResultItem.slug}`;
      finalReferer = `https://subdl.com/subtitle/${searchResultItem.sd_id}/${searchResultItem.slug}`;
    } else if (searchResultItem.type === "tv") {
      // --- TV Show Path ---
      if (request.season === undefined) {
        console.error(
          `[SubDL Source] TV show detected, but no specific season requested. Cannot fetch subtitles without a season slug for this API.`,
        );
        return [];
      }

      console.log(
        `[SubDL Source] TV Show detected (Season ${request.season}), fetching metadata to find season slug...`,
      );

      const metadataApiUrl = `https://subdl.com/_next/data/${buildId}/subtitle/${searchResultItem.sd_id}/${searchResultItem.slug}.json?slug=${searchResultItem.sd_id}&slug=${searchResultItem.slug}`;
      const metadataReferer = `https://subdl.com/subtitle/${searchResultItem.sd_id}/${searchResultItem.slug}`;
      const metadataHeaders = { ...headers, referer: metadataReferer };

      console.log(`[SubDL Source] Calling internal Next.js metadata API: ${metadataApiUrl}`);
      const metadataResponse = await fetchViaSubdlProxy(metadataApiUrl, metadataHeaders);

      if (!metadataResponse.ok) {
        throw new Error(
          `SubDL Next.js metadata API request failed with status ${metadataResponse.status}`,
        );
      }

      const metadataResponseText = await metadataResponse.text();
      console.log(`[SubDL Source] Metadata response: ${metadataResponseText}`);

      interface SubdlNextMetadataResponse {
        pageProps: {
          movieInfo: {
            seasons?: { number: string; name: string }[];
            // Include other movieInfo fields if needed, but seasons is critical
          };
          // Other pageProps fields might exist but are not needed here
        };
        __N_SSP: boolean;
      }
      const metadataData: SubdlNextMetadataResponse = JSON.parse(metadataResponseText);
      const seasons = metadataData.pageProps?.movieInfo?.seasons;
      if (!seasons) {
        throw new Error(
          `[SubDL Source] Metadata API response did not contain expected seasons data (pageProps.movieInfo.seasons). Cannot determine season slug.`,
        );
      }

      const seasonInfo = seasons.find((s) => {
        const seasonNumberFromName = s.name.match(/^Season\s*(\d+)/i);
        if (seasonNumberFromName && parseInt(seasonNumberFromName[1]) === request.season) {
          return true;
        }
        const seasonName = numberToCardinal(request.season!);
        return s.number.includes(seasonName) || s.number === `season-${request.season}`;
      });

      if (seasonInfo && seasonInfo.number) {
        seasonSlug = seasonInfo.number;
        console.log(`[SubDL Source] Found season slug: ${seasonSlug}`);
        finalSubtitleApiUrl = `https://subdl.com/_next/data/${buildId}/subtitle/${searchResultItem.sd_id}/${searchResultItem.slug}/${seasonSlug}.json?slug=${searchResultItem.sd_id}&slug=${searchResultItem.slug}&slug=${seasonSlug}`;
        finalReferer = `https://subdl.com/subtitle/${searchResultItem.sd_id}/${searchResultItem.slug}/${seasonSlug}`;
      } else {
        throw new Error(
          `[SubDL Source] Could not find matching season slug for season ${request.season} in metadata response.`, // Make this an error
        );
      }
    } else {
      throw new Error(`Unknown search result type: ${searchResultItem.type}`);
    }

    if (!finalSubtitleApiUrl) {
      throw new Error("Failed to determine final subtitle API URL.");
    }

    console.log(
      `[SubDL Source] Calling final internal Next.js subtitle API: ${finalSubtitleApiUrl}`,
    );
    const finalSubtitleHeaders = { ...headers, referer: finalReferer };

    const finalSubtitleResponse = await fetchViaSubdlProxy(
      finalSubtitleApiUrl,
      finalSubtitleHeaders,
    );

    if (!finalSubtitleResponse.ok) {
      throw new Error(
        `SubDL final Next.js subtitle API request failed with status ${finalSubtitleResponse.status}`,
      );
    }

    const finalSubtitleResponseText = await finalSubtitleResponse.text();

    interface SubdlNextSubtitleResponse {
      pageProps: SubdlPageProps;
      __N_SSP: boolean;
    }

    const finalSubtitleData: SubdlNextSubtitleResponse = JSON.parse(finalSubtitleResponseText);
    const pageProps = finalSubtitleData.pageProps;

    if (!pageProps || !pageProps.movieInfo) {
      throw new Error("Failed to get page properties (pageProps) from the subtitle API endpoint.");
    }

    console.log(
      `[SubDL Source] Movie/Show info from subtitle API: ${pageProps.movieInfo.name} (${pageProps.movieInfo.year})`,
    );

    if (!pageProps.groupedSubtitles) {
      console.log(`[SubDL Source] No subtitles found via subtitle API`);
      return [];
    }

    // Check if this is a TV show search (has both season and episode)
    // This check is now only used for filtering subtitles, not for fetching logic
    const isTvShow = request.season !== undefined && request.episode !== undefined;

    const results: ResponseType[] = [];

    for (const [language, subtitles] of Object.entries(pageProps.groupedSubtitles)) {
      let langCode = "en";
      const lowerLangName = language.toLowerCase().trim();

      // Custom mapping for non-standard language names
      const customLanguageMap: Record<string, string> = {
        "brazillian-portuguese": "pt",
        "brazilian-portuguese": "pt",
        "brazilian portuguese": "pt",
        portugese: "pt",
        "chinese-bg-code": "zh",
        "chinese simplified": "zh",
        "chinese traditional": "zh",
        farsi_persian: "fa",
        "farsi/persian": "fa",
        farsi: "fa",
        ukranian: "uk",
        português: "pt",
        "português-brasileiro": "pt",
        "português-brasil": "pt",
      };

      // Check custom map first, then try ISO6391
      if (lowerLangName in customLanguageMap) {
        langCode = customLanguageMap[lowerLangName];
      } else {
        const isoLangCode = ISO6391.getCode(lowerLangName);
        if (isoLangCode) {
          langCode = isoLangCode.toLowerCase();
        } else {
          console.warn(
            `[SubDL] Could not find code for language name: "${language}", defaulting to 'en'.`,
          );
        }
      }

      if (
        request.languages &&
        request.languages.length > 0 &&
        !request.languages.includes(langCode)
      ) {
        continue;
      }

      for (const subtitle of subtitles) {
        const format = "srt";
        if (request.formats && request.formats.length > 0 && !request.formats.includes(format)) {
          continue;
        }

        if (request.hearingImpaired === true && subtitle.hi !== 1) {
          continue;
        }

        if (isTvShow) {
          // for season pages, we need to check if the subtitle matches the requested episode
          // some subtitles have season/episode info, others have it in the title or link

          const hasMatchingEpisode =
            (subtitle.season === request.season && subtitle.episode === request.episode) ||
            (subtitle.title &&
              subtitle.title.match(
                new RegExp(`S0?${request.season}E0?${request.episode}\\b`, "i"),
              )) ||
            (subtitle.link &&
              subtitle.link.match(
                new RegExp(`(^|[^a-z0-9])e0?${request.episode}([^a-z0-9]|$)`, "i"),
              )) ||
            (subtitle.extra &&
              subtitle.extra.match(
                new RegExp(`(^|[^a-z0-9])(ep|episode)\\s*0?${request.episode}([^a-z0-9]|$)`, "i"),
              ));

          if (!hasMatchingEpisode) {
            continue;
          }

          console.log(
            `[SubDL Source] Found matching subtitle for S${request.season}E${request.episode}: ${subtitle.title || subtitle.link}`,
          );
        }

        const downloadUrl = `https://subdl.com/download/${subtitle.bucketLink}`;
        const compatibleUrl = `subdl/${subtitle.n_id || subtitle.id}/${subtitle.link}`;

        const countryCode = languageToCountryCode[langCode] || langCode.toUpperCase();

        let mediaDisplay = pageProps.movieInfo.name;
        if (isTvShow) {
          mediaDisplay = `${pageProps.movieInfo.name} - S${request.season.toString().padStart(2, "0")}E${request.episode.toString().padStart(2, "0")}`;
        }

        results.push({
          id: subtitle.n_id || String(subtitle.id),
          url: compatibleUrl,
          flagUrl: `https://flagsapi.com/${countryCode}/flat/24.png`,
          format,
          encoding: "UTF-8",
          media: mediaDisplay,
          display: capitalizeFirstLetter(language),
          language: langCode,
          isHearingImpaired: subtitle.hi === 1,
          source: "subdl",
        });
      }
    }

    console.log(`[SubDL Source] Processed ${results.length} subtitle entries`);
    return results;
  } catch (error) {
    console.error(`[SubDL Source] Error searching for subtitles:`, error);
    return [];
  }
}

/**
 * Helper function to capitalize the first letter of a string
 */
function capitalizeFirstLetter(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
