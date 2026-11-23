import React, { useEffect, useId, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  ExternalLink,
  MapPin,
  PackageCheck,
  Plane,
  RefreshCw,
  Truck,
} from 'lucide-react';
import type { HaulOrder, TrackingMilestone } from '../types/haul';
import {
  buildExternalTrackingUrls,
  detectCarrierFromTrackingNumber,
  formatRelativeTime,
  formatShortDate,
  getTrackingStepIndex,
  TRACKING_MILESTONES,
} from '../utils/haulLogic';
import { TactileButton } from './TactileButtons';
import { SaveToggle } from './SaveToggle';

interface OrderTrackingPanelProps {
  order: HaulOrder;
  onUpdateTracking: (
    orderId: string,
    payload: {
      trackingNumber: string;
      shippingLine: string;
      trackingStatus: TrackingMilestone;
      location?: string;
      note?: string;
    }
  ) => Promise<void>;
  onSyncLiveTracking?: (
    orderId: string,
    trackingNumber: string
  ) => Promise<{ liveFound: boolean; message: string }>;
  compact?: boolean;
}

const SHIPPING_LINE_PRESETS = [
  'DHL Tax-Free Air Mail',
  'Europe Tariffless Line',
  'EMS Preferential Line',
  'PostNL Registered',
  'Cainiao Heavy Parcel',
  'Other Carrier',
];

export function OrderTrackingPanel({
  order,
  onUpdateTracking,
  onSyncLiveTracking,
  compact = false,
}: OrderTrackingPanelProps) {
  const uid = useId();
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? '');
  const [shippingLine, setShippingLine] = useState(
    order.shippingLine || SHIPPING_LINE_PRESETS[0]
  );
  const [trackingStatus, setTrackingStatus] = useState<TrackingMilestone>(
    order.trackingStatus ?? 'in_preparazione'
  );
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncingLive, setSyncingLive] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [liveMessage, setLiveMessage] = useState<string | null>(
    order.trackingLastSyncMessage ?? null
  );
  const [saveTrigger, setSaveTrigger] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [, setRelativeTick] = useState(0);

  useEffect(() => {
    setTrackingNumber(order.trackingNumber ?? '');
    setShippingLine(order.shippingLine || SHIPPING_LINE_PRESETS[0]);
    setTrackingStatus(order.trackingStatus ?? 'in_preparazione');
    setLiveMessage(order.trackingLastSyncMessage ?? null);
    setLocation('');
    setNote('');
    setError(null);
  }, [
    order.id,
    order.trackingNumber,
    order.shippingLine,
    order.trackingStatus,
    order.trackingLastSyncMessage,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRelativeTick((t) => t + 1);
    }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  const currentStepIdx = getTrackingStepIndex(trackingStatus);
  const progressPct = Math.round(((currentStepIdx + 1) / TRACKING_MILESTONES.length) * 100);
  const effectiveCode = trackingNumber.trim() || (order.trackingNumber ?? '');
  const detectedCarrier =
    order.trackingCarrier || detectCarrierFromTrackingNumber(effectiveCode);
  const externalUrls = effectiveCode ? buildExternalTrackingUrls(effectiveCode) : null;
  const events = [...(order.trackingEvents ?? [])].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );

  const handleSyncNow = async (codeOverride?: string) => {
    if (!onSyncLiveTracking) return;
    const code = (codeOverride ?? effectiveCode).trim();
    if (!code) {
      setError('Enter a tracking number first to run live verification.');
      return;
    }
    setSyncingLive(true);
    setError(null);
    try {
      const result = await onSyncLiveTracking(order.id, code);
      setLiveMessage(result.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error syncing live carrier tracking'
      );
    } finally {
      setSyncingLive(false);
    }
  };

  useEffect(() => {
    if (!autoSync || !effectiveCode || !onSyncLiveTracking) return;
    const interval = window.setInterval(() => {
      void handleSyncNow(effectiveCode);
    }, 30000);
    return () => window.clearInterval(interval);
  }, [autoSync, effectiveCode, order.id]);

  const persistTracking = async (
    nextStatus: TrackingMilestone,
    explicitNote?: string,
    explicitLocation?: string
  ): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      await onUpdateTracking(order.id, {
        trackingNumber: trackingNumber.trim(),
        shippingLine: shippingLine.trim(),
        trackingStatus: nextStatus,
        location: explicitLocation ?? location.trim(),
        note: explicitNote ?? note.trim(),
      });
      setLocation('');
      setNote('');
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error saving shipment tracking'
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaveTrigger((c) => c + 1);
  };

  return (
    <section
      aria-label={`Shipment tracking for ${order.title}`}
      className={`bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl ${
        compact ? 'p-4' : 'p-5'
      } space-y-4`}
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[#EFEFEA] dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0] shrink-0">
            {trackingStatus === 'consegnato' ? (
              <PackageCheck className="w-4 h-4 text-[#16A34A]" />
            ) : trackingStatus === 'in_transito' ? (
              <Plane className="w-4 h-4 text-[#E11D48]" />
            ) : (
              <Truck className="w-4 h-4" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0]">
                Shipment Tracking &amp; Delivery
              </h3>
              <span className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                · {formatRelativeTime(order.trackingUpdatedAt)}
              </span>
            </div>
            <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] truncate">
              {effectiveCode
                ? `Tracking #: ${effectiveCode} · ${detectedCarrier}`
                : 'Enter your Superbuy tracking number to monitor parcel progress.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onSyncLiveTracking && (
            <>
              <TactileButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={syncingLive || !effectiveCode}
                onClick={() => void handleSyncNow()}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${syncingLive ? 'animate-spin text-[#E11D48]' : ''}`}
                />
                {syncingLive ? 'Syncing...' : 'Live Check'}
              </TactileButton>

              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] text-[11px] font-medium text-[#111110] dark:text-[#F4F4F0] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  disabled={!effectiveCode}
                  className="accent-[#E11D48] w-3.5 h-3.5"
                />
                Auto-sync 30s
              </label>
            </>
          )}

          {externalUrls && (
            <>
              <a
                href={externalUrls.seventeenTrack}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#F7F7F5] dark:bg-[#242422] hover:bg-[#EFEFEA] dark:hover:bg-[#30302C] text-[#111110] dark:text-[#F4F4F0] border border-[#E5E5E0] dark:border-[#343430] transition-colors whitespace-nowrap"
              >
                17TRACK
                <ExternalLink className="w-3 h-3 text-[#E11D48]" />
              </a>
              <a
                href={externalUrls.parcelsApp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#F7F7F5] dark:bg-[#242422] hover:bg-[#EFEFEA] dark:hover:bg-[#30302C] text-[#111110] dark:text-[#F4F4F0] border border-[#E5E5E0] dark:border-[#343430] transition-colors whitespace-nowrap"
              >
                ParcelsApp
                <ExternalLink className="w-3 h-3 text-[#E11D48]" />
              </a>
              <a
                href={externalUrls.cainiao}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#F7F7F5] dark:bg-[#242422] hover:bg-[#EFEFEA] dark:hover:bg-[#30302C] text-[#111110] dark:text-[#F4F4F0] border border-[#E5E5E0] dark:border-[#343430] transition-colors whitespace-nowrap"
              >
                Cainiao
                <ExternalLink className="w-3 h-3 text-[#E11D48]" />
              </a>
            </>
          )}
        </div>
      </div>

      {/* Dynamic Animated Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
          <span>
            Step {currentStepIdx + 1} of {TRACKING_MILESTONES.length} ·{' '}
            {TRACKING_MILESTONES[currentStepIdx]?.label}
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-[#EFEFEA] dark:bg-[#242422] overflow-hidden">
          <motion.div
            initial={false}
            animate={{ scaleX: progressPct / 100 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            style={{ transformOrigin: 'left center' }}
            className={`h-full w-full rounded-full ${
              trackingStatus === 'consegnato' ? 'bg-[#16A34A]' : 'bg-[#E11D48]'
            }`}
          />
        </div>
      </div>

      {liveMessage && (
        <p
          data-testid={`tracking-live-status-${order.id}`}
          className="text-xs text-[#52524E] dark:text-[#B4B4AC] bg-[#F7F7F5] dark:bg-[#222220] border border-[#E5E5E0] dark:border-[#343430] rounded-xl px-3 py-2"
        >
          {liveMessage}
        </p>
      )}

      {/* 6-Step Interactive Milestone Stepper */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {TRACKING_MILESTONES.map((step, idx) => {
          const isCurrent = step.id === trackingStatus;
          const isCompleted = idx <= currentStepIdx;
          return (
            <button
              key={step.id}
              type="button"
              disabled={saving}
              onClick={() => {
                setTrackingStatus(step.id);
                void persistTracking(step.id);
              }}
              aria-pressed={isCurrent}
              className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] ${
                isCurrent
                  ? 'border-[#E11D48] bg-[#FFF1F2] dark:bg-[#3A1620] text-[#111110] dark:text-white'
                  : isCompleted
                    ? 'border-[#16A34A]/40 bg-[#F0FDF4] dark:bg-[#13291B] text-[#111110] dark:text-[#E5F7EB]'
                    : 'border-[#E5E5E0] dark:border-[#2C2C2A] bg-[#F7F7F5] dark:bg-[#222220] text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-mono tabular-nums opacity-75">
                  0{idx + 1}
                </span>
                {isCompleted && (
                  <Check
                    className={`w-3 h-3 ${
                      isCurrent ? 'text-[#E11D48]' : 'text-[#16A34A]'
                    }`}
                  />
                )}
              </div>
              <p className="text-[11px] font-semibold leading-tight">
                {step.shortLabel}
              </p>
            </button>
          );
        })}
      </div>

      {/* Form: Tracking Number + Courier + Optional Checkpoint Note */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`${uid}-code`}
              className="block text-[11px] font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1"
            >
              Tracking Number
            </label>
            <input
              id={`${uid}-code`}
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="e.g. LD849201945CN or YT263..."
              className="w-full px-3 py-2 text-xs font-mono bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
            />
          </div>

          <div>
            <label
              htmlFor={`${uid}-line`}
              className="block text-[11px] font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1"
            >
              Superbuy Line / Carrier
            </label>
            <select
              id={`${uid}-line`}
              value={shippingLine}
              onChange={(e) => setShippingLine(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:border-[#111110] dark:focus:border-[#F4F4F0]"
            >
              {SHIPPING_LINE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)_auto] gap-2 items-end">
          <div>
            <label
              htmlFor={`${uid}-loc`}
              className="block text-[11px] font-medium text-[#6E6E68] dark:text-[#9A9A92] mb-1"
            >
              Location (optional)
            </label>
            <input
              id={`${uid}-loc`}
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Amsterdam / Milan"
              className="w-full h-[36px] px-3 text-xs bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:border-[#111110]"
            />
          </div>

          <div>
            <label
              htmlFor={`${uid}-note`}
              className="block text-[11px] font-medium text-[#6E6E68] dark:text-[#9A9A92] mb-1"
            >
              Checkpoint update (optional)
            </label>
            <input
              id={`${uid}-note`}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Customs cleared, handed over to local courier"
              className="w-full h-[36px] px-3 text-xs bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:border-[#111110]"
            />
          </div>

          <div className="flex justify-end items-end">
            <SaveToggle
              type="submit"
              size="xs"
              idleText="Save Tracking"
              savedText="Saved"
              idleWidth={132}
              savedWidth={114}
              triggerCount={saveTrigger}
              resetKey={`${order.id}-${trackingNumber}-${shippingLine}-${trackingStatus}-${location}-${note}`}
              onSave={() => persistTracking(trackingStatus)}
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-[#DC2626] bg-[#FEF2F2] dark:bg-[#3A161A] border border-[#FECACA] dark:border-[#7F1D1D] rounded-xl px-3 py-2">
            {error}
          </p>
        )}
      </form>

      {/* Checkpoint Timeline */}
      {events.length > 0 && (
        <div className="pt-3 border-t border-[#EFEFEA] dark:border-[#2C2C2A] space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6E6E68] dark:text-[#9A9A92]">
            Tracking Timeline ({events.length})
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {events.map((ev, index) => {
              const stepMeta = TRACKING_MILESTONES.find((m) => m.id === ev.milestone);
              return (
                <div
                  key={ev.id || `${ev.timestamp}-${index}`}
                  className="flex items-start gap-2.5 text-xs"
                >
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      index === 0 ? 'bg-[#E11D48]' : 'bg-[#D6D6CF] dark:bg-[#4A4A45]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#111110] dark:text-[#F4F4F0]">
                        {stepMeta?.label ?? ev.milestone}
                      </span>
                      <span className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                        {formatShortDate(ev.timestamp)}
                      </span>
                    </div>
                    {ev.location && (
                      <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {ev.location}
                      </p>
                    )}
                    {ev.description && (
                      <p className="text-[11px] text-[#52524E] dark:text-[#B4B4AC] mt-0.5">
                        {ev.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
