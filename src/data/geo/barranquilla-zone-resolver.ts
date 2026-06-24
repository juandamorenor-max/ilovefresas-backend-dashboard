import {
  barranquillaNeighborhoods,
  normalizeBarranquillaZoneText,
  type BarranquillaNeighborhood
} from "./barranquilla-neighborhoods.generated.js";
import { barranquillaLandmarks } from "./barranquilla-landmarks.manual.js";
import { barranquillaZoneAliases } from "./barranquilla-zone-aliases.manual.js";

export { normalizeBarranquillaZoneText };

export type BarranquillaZoneResolution =
  | {
      status: "match";
      matchType: "exact" | "alias" | "fuzzy";
      zone: BarranquillaNeighborhood;
      candidates: BarranquillaNeighborhood[];
      coverageStatus: "review_required";
      deliveryFee: null;
      deliveryFeeStatus: "not_configured";
    }
  | {
      status: "ambiguous";
      candidates: BarranquillaNeighborhood[];
      reason: string;
    }
  | {
      status: "landmark_only";
      landmark: string;
      candidates: BarranquillaNeighborhood[];
      reason: string;
    }
  | {
      status: "outside_city";
      reason: string;
    }
  | {
      status: "not_found";
      reason: string;
    };

const FORBIDDEN_FINAL_ZONES = new Set([
  "barranquilla",
  "norte",
  "sur",
  "centro de barranquilla",
  "zona norte",
  "zona sur",
  "centro"
]);

const OUTSIDE_CITY_TERMS = ["soledad", "galapa", "malambo", "puerto colombia"];

const aliasMap = new Map<string, string[]>();
for (const entry of barranquillaZoneAliases) {
  const current = aliasMap.get(entry.neighborhoodName) ?? [];
  current.push(...entry.aliases);
  aliasMap.set(entry.neighborhoodName, current);
}

function candidatesFor(neighborhood: BarranquillaNeighborhood) {
  return [
    neighborhood.name,
    neighborhood.normalizedName,
    ...neighborhood.aliases,
    ...(aliasMap.get(neighborhood.name) ?? [])
  ]
    .map(normalizeBarranquillaZoneText)
    .filter(Boolean);
}

function uniqueNeighborhoods(neighborhoods: BarranquillaNeighborhood[]) {
  const seen = new Set<string>();
  return neighborhoods.filter((neighborhood) => {
    if (seen.has(neighborhood.id)) {
      return false;
    }

    seen.add(neighborhood.id);
    return true;
  });
}

function containsNormalizedPhrase(input: string, candidate: string) {
  return new RegExp(`(^|\\s)${escapeRegExp(candidate)}(\\s|$)`).test(input);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) {
    dp[i]![0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    dp[0]![j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }

  return dp[a.length]![b.length]!;
}

function fuzzyMatches(input: string) {
  const words = input.split(/\s+/).filter(Boolean);
  return barranquillaNeighborhoods.filter((neighborhood) =>
    candidatesFor(neighborhood).some((candidate) => {
      if (candidate.length < 5) {
        return false;
      }

      const candidateWords = candidate.split(/\s+/).length;
      const windows = words
        .map((_, index) => words.slice(index, index + candidateWords).join(" "))
        .filter((window) => window.length > 0);

      return windows.some((window) => {
        const distance = levenshtein(window, candidate);
        const maxDistance = candidate.length >= 12 ? 2 : 1;
        return distance > 0 && distance <= maxDistance;
      });
    })
  );
}

function landmarkMatch(input: string) {
  return barranquillaLandmarks.find((landmark) =>
    [landmark.name, ...landmark.aliases].some((alias) =>
      containsNormalizedPhrase(input, normalizeBarranquillaZoneText(alias))
    )
  );
}

function extractExplicitNeighborhoodText(input: string) {
  const match = input.match(/\bbarrio\s+(.+)$/);
  if (!match?.[1]) {
    return null;
  }

  return match[1]
    .replace(/\b(?:pago|metodo|por)\b.*$/g, "")
    .replace(/\b(?:y|con)\s+(?:nequi|daviplata|efectivo|transferencia|bancolombia)\b.*$/g, "")
    .trim();
}

export function resolveBarranquillaZone(input: string): BarranquillaZoneResolution {
  const normalized = normalizeBarranquillaZoneText(input);
  const explicitNeighborhoodText = extractExplicitNeighborhoodText(normalized);
  const searchText = explicitNeighborhoodText || normalized;

  if (!normalized) {
    return { status: "not_found", reason: "empty_input" };
  }

  if (FORBIDDEN_FINAL_ZONES.has(normalized)) {
    return { status: "not_found", reason: "generic_city_or_area" };
  }

  if (OUTSIDE_CITY_TERMS.some((term) => containsNormalizedPhrase(normalized, term))) {
    return { status: "outside_city", reason: "outside_barranquilla_configured_city" };
  }

  const exactMatches = uniqueNeighborhoods(
    barranquillaNeighborhoods.filter((neighborhood) =>
      candidatesFor(neighborhood).some((candidate) => searchText === candidate)
    )
  );
  if (exactMatches.length === 1) {
    return {
      status: "match",
      matchType: "exact",
      zone: exactMatches[0]!,
      candidates: exactMatches,
      coverageStatus: "review_required",
      deliveryFee: null,
      deliveryFeeStatus: "not_configured"
    };
  }
  if (exactMatches.length > 1) {
    return { status: "ambiguous", candidates: exactMatches, reason: "multiple_exact_matches" };
  }

  const aliasOrContainedMatches = uniqueNeighborhoods(
    barranquillaNeighborhoods.filter((neighborhood) =>
      candidatesFor(neighborhood).some((candidate) =>
        explicitNeighborhoodText
          ? searchText === candidate
          : containsNormalizedPhrase(searchText, candidate)
      )
    )
  );
  if (aliasOrContainedMatches.length === 1) {
    return {
      status: "match",
      matchType: "alias",
      zone: aliasOrContainedMatches[0]!,
      candidates: aliasOrContainedMatches,
      coverageStatus: "review_required",
      deliveryFee: null,
      deliveryFeeStatus: "not_configured"
    };
  }
  if (aliasOrContainedMatches.length > 1) {
    return {
      status: "ambiguous",
      candidates: aliasOrContainedMatches,
      reason: "multiple_alias_or_contained_matches"
    };
  }

  const landmark = landmarkMatch(normalized);
  if (landmark) {
    return {
      status: "landmark_only",
      landmark: landmark.name,
      candidates: [],
      reason: "landmark_without_neighborhood"
    };
  }

  const fuzzy = uniqueNeighborhoods(fuzzyMatches(searchText));
  if (fuzzy.length === 1) {
    return {
      status: "match",
      matchType: "fuzzy",
      zone: fuzzy[0]!,
      candidates: fuzzy,
      coverageStatus: "review_required",
      deliveryFee: null,
      deliveryFeeStatus: "not_configured"
    };
  }
  if (fuzzy.length > 1) {
    return { status: "ambiguous", candidates: fuzzy, reason: "multiple_fuzzy_matches" };
  }

  return { status: "not_found", reason: "no_configured_neighborhood_match" };
}
