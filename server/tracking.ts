import type { TrackingEvent, TrackingMilestone } from '../src/types/haul.ts';
import { detectCarrierFromTrackingNumber } from '../src/utils/haulLogic.ts';

export interface LiveTrackingSyncResult {
  trackingNumber: string;
  carrier: string;
  liveFound: boolean;
  source: 'live_api' | 'manual';
  milestone: TrackingMilestone | null;
  events: TrackingEvent[];
  message: string;
  checkedAt: string;
}

interface CainiaoDetailEntry {
  time?: number;
  timeStr?: string;
  desc?: string;
  standerdDesc?: string;
}

interface CainiaoModuleEntry {
  mailNo?: string;
  status?: string;
  statusDesc?: string;
  originCountry?: string;
  destCountry?: string;
  detailList?: CainiaoDetailEntry[];
}

interface CainiaoApiResponse {
  success?: boolean;
  module?: CainiaoModuleEntry[];
}

export function inferMilestoneFromCheckpoint(desc: string): TrackingMilestone {
  const lower = desc.toLowerCase();
  if (
    lower.includes('delivered') ||
    lower.includes('consegnato') ||
    lower.includes('signed') ||
    lower.includes('picked up by recipient')
  ) {
    return 'consegnato';
  }
  if (
    lower.includes('out for delivery') ||
    lower.includes('in consegna') ||
    lower.includes('local courier') ||
    lower.includes('arrived at destination post office') ||
    lower.includes('poste italiane') ||
    lower.includes('sda') ||
    lower.includes('gls') ||
    lower.includes('brt')
  ) {
    return 'in_consegna';
  }
  if (
    lower.includes('customs') ||
    lower.includes('dogan') ||
    lower.includes('clearance') ||
    lower.includes('amsterdam') ||
    lower.includes('germany') ||
    lower.includes('import')
  ) {
    return 'dogana_ue';
  }
  if (
    lower.includes('airline') ||
    lower.includes('flight') ||
    lower.includes('departed') ||
    lower.includes('in transit') ||
    lower.includes('transito') ||
    lower.includes('export')
  ) {
    return 'in_transito';
  }
  if (
    lower.includes('accepted') ||
    lower.includes('received by logistics') ||
    lower.includes('dispatched') ||
    lower.includes('guangdong') ||
    lower.includes('shenzhen') ||
    lower.includes('warehouse')
  ) {
    return 'magazzino_cina';
  }
  return 'in_preparazione';
}

export async function fetchLiveCarrierTracking(
  rawTrackingNumber: string
): Promise<LiveTrackingSyncResult> {
  const trackingNumber = rawTrackingNumber.trim().toUpperCase();
  const carrier = detectCarrierFromTrackingNumber(trackingNumber);
  const checkedAt = new Date().toISOString();

  if (!trackingNumber || trackingNumber.length < 6 || !/^[A-Z0-9\-_]{6,50}$/.test(trackingNumber)) {
    return {
      trackingNumber,
      carrier,
      liveFound: false,
      source: 'manual',
      milestone: null,
      events: [],
      message: 'Enter a valid alphanumeric tracking number (6 to 50 characters) to query the carrier.',
      checkedAt,
    };
  }

  try {
    const url = `https://global.cainiao.com/global/detail.json?mailNos=${encodeURIComponent(
      trackingNumber
    )}&lang=en-US`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'HaulDesk-Tracker/1.0',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        trackingNumber,
        carrier,
        liveFound: false,
        source: 'manual',
        milestone: null,
        events: [],
        message: `HTTP ${response.status} response from ${carrier} gateway. Check on 17TRACK or update milestones manually.`,
        checkedAt,
      };
    }

    const data = (await response.json()) as CainiaoApiResponse;
    const mod = data.module?.[0];
    const details = Array.isArray(mod?.detailList) ? mod.detailList : [];

    if (!data.success || details.length === 0) {
      return {
        trackingNumber,
        carrier,
        liveFound: false,
        source: 'manual',
        milestone: null,
        events: [],
        message: `No public tracking events returned for ${trackingNumber} (${carrier}): the parcel may have just been dispatched or uses private DHL triangular tracking. Check 17TRACK/ParcelsApp.`,
        checkedAt,
      };
    }

    const mappedEvents: TrackingEvent[] = details.slice(0, 12).map((d, idx) => {
      const desc = (d.desc || d.standerdDesc || 'Carrier update').trim();
      const isoTime = d.timeStr
        ? new Date(d.timeStr.replace(' ', 'T') + 'Z').toISOString()
        : d.time
          ? new Date(d.time).toISOString()
          : checkedAt;

      return {
        id: `live-${trackingNumber}-${idx}-${Date.now()}`,
        milestone: inferMilestoneFromCheckpoint(desc),
        location: mod?.destCountry || mod?.originCountry || carrier,
        description: desc,
        timestamp: Number.isNaN(Date.parse(isoTime)) ? checkedAt : isoTime,
      };
    });

    const latestMilestone = mappedEvents[0]?.milestone ?? 'magazzino_cina';

    return {
      trackingNumber,
      carrier,
      liveFound: true,
      source: 'live_api',
      milestone: latestMilestone,
      events: mappedEvents,
      message: `Synced ${mappedEvents.length} live carrier events (${carrier}).`,
      checkedAt,
    };
  } catch {
    return {
      trackingNumber,
      carrier,
      liveFound: false,
      source: 'manual',
      milestone: null,
      events: [],
      message: `Carrier gateway is temporarily unreachable for ${trackingNumber} (${carrier}). Use direct 17TRACK / ParcelsApp links or update milestones manually.`,
      checkedAt,
    };
  }
}
