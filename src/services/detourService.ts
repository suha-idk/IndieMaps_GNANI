import { DetourCandidate, JourneyState, LatLng, SearchAnchor } from '../types/navigation';
import { resolveSearchAnchor } from './anchorService';
import { searchPlaces } from './placesService';

function getEndpointUrl(path: string): string {
  if (typeof window !== 'undefined') return path;
  return `http://127.0.0.1:3000${path}`;
}

export function haversineDistanceKm(p1: LatLng, p2: LatLng): number {
  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function samplePolyline(points: LatLng[], count = 4): LatLng[] {
  if (points.length <= count) return points;
  const samples: LatLng[] = [];
  const step = (points.length - 1) / (count + 1);
  for (let i = 1; i <= count; i++) {
    const idx = Math.min(Math.round(i * step), points.length - 1);
    samples.push(points[idx]);
  }
  return samples;
}

export async function findLowestDetourStop(
  journey: JourneyState,
  category: 'gas_station' | 'cng_station' | 'restaurant' | 'hospital' | 'pharmacy' | 'parking' | 'ev_charging' = 'gas_station',
  anchorType?: SearchAnchor,
  stopIdentifier?: { byName?: string; byOrdinal?: number },
  userLocation?: LatLng | null,
  routePath?: LatLng[],
  customQuery?: string,
  minRating?: number
): Promise<{ best: DetourCandidate | null; ranked: DetourCandidate[]; error?: string }> {
  if (!journey.origin || !journey.destination) {
    return { best: null, ranked: [], error: 'Both origin and destination are required to calculate detour' };
  }

  try {
    const categoryLabels: Record<string, string> = {
      gas_station: 'Petrol pump',
      cng_station: 'CNG pump',
      restaurant: 'Punjabi restaurant',
      hospital: 'Hospital emergency',
      pharmacy: 'Pharmacy medical store',
      parking: 'Parking',
      ev_charging: 'EV charging station',
    };

    const label = customQuery || categoryLabels[category] || 'Petrol pump';

    // 1. Resolve anchor
    const resolvedAnchor = resolveSearchAnchor(
      journey,
      userLocation || null,
      anchorType,
      stopIdentifier,
      routePath
    );

    if (!resolvedAnchor) {
      return { best: null, ranked: [], error: 'Unable to resolve search location anchor' };
    }

    const isRouteCorridor = (anchorType === 'route' || resolvedAnchor.anchorType === 'route');
    const hasPolyline = Boolean(routePath && routePath.length >= 2);
    let isCorridorApproximate = false;

    let rawCandidates: any[] = [];

    // 2. Fetch candidates:
    // If route corridor search and route polyline is available: sample 3-5 points along polyline
    if (isRouteCorridor && hasPolyline && routePath) {
      const sampledPoints = samplePolyline(routePath, 4);
      const searchPromises = sampledPoints.map(async (sample) => {
        try {
          const res = await fetch(getEndpointUrl('/api/places/search'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              textQuery: label,
              locationBias: {
                center: sample,
                radius: 15000,
              },
              maxResultCount: 6,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            return data.places || [];
          }
        } catch {
          // Fall through
        }
        // Fallback to placesService
        const fallback = await searchPlaces(label, { center: sample, radius: 15000 });
        return fallback.map((p) => ({
          id: p.id,
          displayName: { text: p.name },
          formattedAddress: p.address,
          location: p.latLng ? { latitude: p.latLng.lat, longitude: p.latLng.lng } : undefined,
          rating: p.rating,
          userRatingCount: p.userRatingCount,
          types: p.types,
          primaryType: p.primaryType,
        }));
      });

      const resultsPerSample = await Promise.all(searchPromises);
      const candidateMap = new Map<string, any>();

      for (const batch of resultsPerSample) {
        for (const place of batch) {
          if (!place.id) continue;
          if (!candidateMap.has(place.id)) {
            // Proximity filter: candidate must be within 25 km of at least one sampled point
            if (place.location?.latitude && place.location?.longitude) {
              const placeCoord: LatLng = { lat: place.location.latitude, lng: place.location.longitude };
              const minDistance = Math.min(...sampledPoints.map((s) => haversineDistanceKm(s, placeCoord)));
              if (minDistance <= 25) {
                candidateMap.set(place.id, place);
              }
            } else {
              candidateMap.set(place.id, place);
            }
          }
        }
      }
      rawCandidates = Array.from(candidateMap.values());
    }

    // If polyline was not available or produced no candidates, use anchor-based search
    if (rawCandidates.length === 0) {
      if (isRouteCorridor && !hasPolyline) {
        isCorridorApproximate = true;
      }

      const isGenericName =
        !resolvedAnchor.name || /^(?:starting point|current location|my current|my starting)/i.test(resolvedAnchor.name);
      let textQuery = label;
      if (!isGenericName && !customQuery) {
        if (resolvedAnchor.anchorType === 'stop' || resolvedAnchor.anchorType === 'destination') {
          textQuery = `${label} near ${resolvedAnchor.name}`;
        } else if (resolvedAnchor.anchorType === 'origin') {
          textQuery = `${label} in ${resolvedAnchor.name}`;
        }
      }

      try {
        const placesRes = await fetch(getEndpointUrl('/api/places/search'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            textQuery,
            locationBias: {
              center: resolvedAnchor.coordinates,
              radius: resolvedAnchor.radiusMeters,
            },
            maxResultCount: 8,
          }),
        });

        if (placesRes.ok) {
          const placesData = await placesRes.json();
          rawCandidates = placesData.places || [];
        }
      } catch {
        // Fall through to placesService
      }

      if (rawCandidates.length === 0) {
        const fallbackCandidates = await searchPlaces(textQuery, { center: resolvedAnchor.coordinates });
        rawCandidates = fallbackCandidates.map((p) => ({
          id: p.id,
          displayName: { text: p.name },
          formattedAddress: p.address,
          location: p.latLng ? { latitude: p.latLng.lat, longitude: p.latLng.lng } : undefined,
          rating: p.rating,
          userRatingCount: p.userRatingCount,
          types: p.types,
          primaryType: p.primaryType,
        }));
      }
    }

    // 3. Apply strict star rating filter (e.g. > 4.5 stars; missing ratings and <= 4.5 are excluded)
    if (typeof minRating === 'number') {
      rawCandidates = rawCandidates.filter((c: any) => typeof c.rating === 'number' && c.rating > minRating);
    }

    if (rawCandidates.length === 0) {
      const ratingMsg = typeof minRating === 'number' ? ` with rating above ${minRating} stars` : '';
      return {
        best: null,
        ranked: [],
        error: `No ${label.toLowerCase()}${ratingMsg} found near ${resolvedAnchor.name || 'route'}`,
      };
    }

    // 4. Call /api/detour-rank with current travel mode and insertion hint
    let rankedWithAnchor: DetourCandidate[] = [];
    try {
      const rankRes = await fetch(getEndpointUrl('/api/detour-rank'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: journey.origin,
          destination: journey.destination,
          currentStops: journey.stops,
          candidates: rawCandidates,
          travelMode: journey.travelMode || 'DRIVE',
          anchorType: resolvedAnchor.anchorType,
          suggestedInsertIndex: resolvedAnchor.insertionIndex,
        }),
      });

      if (rankRes.ok) {
        const rankData = await rankRes.json();
        if (Array.isArray(rankData.rankedCandidates) && rankData.rankedCandidates.length > 0) {
          rankedWithAnchor = rankData.rankedCandidates.map((c: any) => ({
            ...c,
            name: c.name || c.displayName?.text,
            formattedAddress: c.formattedAddress || c.address,
            anchorType: resolvedAnchor.anchorType,
            bestInsertIndex: resolvedAnchor.insertionIndex,
            isRankedByDetour: true,
            detourUnavailable: false,
            corridorApproximate: isCorridorApproximate,
          }));
        }
      }
    } catch {
      // Detour ranking endpoint failed
    }

    // 5. CRITICAL: Strictly NO fabricated detour metrics!
    // If detour ranking failed or is unavailable, never invent +0.6km, +2 mins, etc.
    if (rankedWithAnchor.length === 0) {
      const unrankedCandidates: DetourCandidate[] = rawCandidates.map((c: any) => ({
        id: c.id,
        name: c.displayName?.text || c.name || 'Candidate',
        formattedAddress: c.formattedAddress || c.address || '',
        location: c.location,
        rating: c.rating,
        userRatingCount: c.userRatingCount,
        types: c.types,
        primaryType: c.primaryType,
        detourUnavailable: true,
        detourKm: undefined,
        detourMinutes: undefined,
        detourMeters: undefined,
        score: undefined,
        isRankedByDetour: false,
        anchorType: resolvedAnchor.anchorType,
        bestInsertIndex: resolvedAnchor.insertionIndex,
        corridorApproximate: isCorridorApproximate,
      }));

      return {
        best: null, // No "best lowest detour" stop can be declared without verified detour computation
        ranked: unrankedCandidates,
        error: 'Detour ranking unavailable; candidates displayed without verified detour metrics.',
      };
    }

    return {
      best: rankedWithAnchor[0] || null,
      ranked: rankedWithAnchor,
    };
  } catch (err: any) {
    console.warn('findLowestDetourStop warning:', err?.message || err);
    return { best: null, ranked: [], error: err?.message || 'Detour discovery failed' };
  }
}
