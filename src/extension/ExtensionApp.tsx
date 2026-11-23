import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ExternalLink,
  Link2,
  Package,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  Settings,
  Sun,
  Moon,
  Tag,
  Upload,
  Wifi,
  WifiOff,
  X,
  AlertCircle,
} from 'lucide-react';
import { getCategoryLabel, PRODUCT_CATEGORIES, type HaulOrder } from '../types/haul';
import {
  convertCnyToCurrency,
  DEFAULT_CNY_TO_EUR_RATE,
  detectPlatformFromUrl,
  extractVendorHintFromUrl,
  formatCurrency,
  PLATFORM_LABELS,
} from '../utils/haulLogic';
import {
  createEmptyExtensionDraft,
  DEFAULT_EXTENSION_SERVER_URL,
  normalizeServerUrl,
  validateAllWizardSteps,
  validateWizardStep,
  WIZARD_STEPS,
  type ExtensionDraftState,
  type ExtensionWizardStep,
  type WizardFieldErrors,
} from '../utils/extensionWizard';
import { CategoryIcon } from '../components/CategoryIcons';
import { TactileButton } from '../components/TactileButtons';
import { ScrollFadeList } from '../components/ScrollFadeList';
import { SaveToggle } from '../components/SaveToggle';
import { SwitchMode } from '../components/SwitchMode';
import {
  canOpenSidebar,
  fetchServerSnapshot,
  fileToResizedDataUrl,
  isSidebarView,
  loadExtensionPreferences,
  openExtensionSidebar,
  openExternalUrl,
  requestServerHostPermission,
  saveDraftPreference,
  saveServerUrlPreference,
  saveThemePreference,
  submitExtensionProduct,
} from './extensionApi';
import {
  extractDroppedImageInput,
  isLikelyImageFile,
  resolveImageUrlsToBlobs,
} from '../utils/dragDropImage';

type ConnectionStatus = 'checking' | 'connected' | 'error';

export default function ExtensionApp() {
  const [sidebarMode, setSidebarMode] = useState<boolean>(() => isSidebarView());
  const showSidebarAction = useMemo(() => !sidebarMode && canOpenSidebar(), [sidebarMode]);

  useEffect(() => {
    const syncSidebarMode = () => setSidebarMode(isSidebarView());
    window.addEventListener('resize', syncSidebarMode);
    return () => window.removeEventListener('resize', syncSidebarMode);
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingDraftRef = useRef<ExtensionDraftState | null>(null);

  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_EXTENSION_SERVER_URL);
  const [settingsUrlInput, setSettingsUrlInput] = useState(DEFAULT_EXTENSION_SERVER_URL);
  const [settingsUrlError, setSettingsUrlError] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<HaulOrder[]>([]);
  const [existingVendors, setExistingVendors] = useState<string[]>([]);

  const [draft, setDraft] = useState<ExtensionDraftState>(() => createEmptyExtensionDraft());
  const [errors, setErrors] = useState<WizardFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const [saveTrigger, setSaveTrigger] = useState(0);
  const [savedNotice, setSavedNotice] = useState<{
    title: string;
    destinationLabel: string;
  } | null>(null);

  const syncWithServer = useCallback(async (targetUrl: string) => {
    setConnectionStatus('checking');
    setConnectionError(null);
    try {
      const snapshot = await fetchServerSnapshot(targetUrl);
      setOpenOrders(snapshot.openOrders);
      setExistingVendors(snapshot.existingVendors);
      setConnectionStatus('connected');

      setDraft((prev) => {
        const hasValidSelected =
          prev.selectedOrderId &&
          snapshot.openOrders.some((o) => o.id === prev.selectedOrderId);
        if (hasValidSelected) return prev;
        const firstOpenId = snapshot.openOrders[0]?.id ?? '';
        if (!firstOpenId && prev.selectedOrderId === '') return prev;
        return {
          ...prev,
          selectedOrderId: firstOpenId,
        };
      });
    } catch (err) {
      setConnectionStatus('error');
      setConnectionError(
        err instanceof Error ? err.message : 'Failed to connect to server.'
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadExtensionPreferences().then((prefs) => {
      if (cancelled) return;
      setServerUrl(prefs.serverUrl);
      setSettingsUrlInput(prefs.serverUrl);
      setIsDarkMode(prefs.isDark);
      setDraft(prefs.draft);
      setPrefsLoaded(true);
      void syncWithServer(prefs.serverUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [syncWithServer]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    if (prefsLoaded) {
      void saveThemePreference(isDarkMode);
    }
  }, [isDarkMode, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    void saveDraftPreference(draft);
  }, [draft, prefsLoaded]);

  const processImageBlobs = useCallback(async (blobs: Blob[]) => {
    if (blobs.length === 0) return;
    try {
      const converted = await Promise.all(blobs.map((b) => fileToResizedDataUrl(b)));
      const newUrls = converted.map((c) => c.dataUrl);
      setDraft((prev) => {
        const merged = Array.from(new Set([...prev.imagePreviews, ...newUrls])).slice(0, 8);
        return { ...prev, imagePreviews: merged };
      });
      setSubmitError(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to load image.');
    }
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageBlobs: Blob[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) imageBlobs.push(blob);
        }
      }
      if (imageBlobs.length > 0) {
        void processImageBlobs(imageBlobs);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processImageBlobs]);

  const updateDraft = (patch: Partial<ExtensionDraftState>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleLinkChange = (value: string) => {
    setDraft((prev) => {
      let nextVendor = prev.vendor;
      if (!prev.vendor.trim()) {
        const hint = extractVendorHintFromUrl(value);
        if (hint) nextVendor = hint;
      }
      return { ...prev, link: value, vendor: nextVendor };
    });
    if (errors.link) {
      setErrors((prev) => ({ ...prev, link: undefined }));
    }
  };

  const handleRemoveImage = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      imagePreviews: prev.imagePreviews.filter((_, i) => i !== index),
    }));
  };

  const handleSetPrimaryImage = (index: number) => {
    setDraft((prev) => {
      if (index <= 0 || index >= prev.imagePreviews.length) return prev;
      const chosen = prev.imagePreviews[index];
      return {
        ...prev,
        imagePreviews: [chosen, ...prev.imagePreviews.filter((_, i) => i !== index)],
      };
    });
  };

  const handleNextStep = () => {
    const stepErrors = validateWizardStep(draft.step, draft, openOrders);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    if (draft.step < 4) {
      updateDraft({ step: (draft.step + 1) as ExtensionWizardStep });
    }
  };

  const handlePrevStep = () => {
    setErrors({});
    setSubmitError(null);
    if (draft.step > 1) {
      updateDraft({ step: (draft.step - 1) as ExtensionWizardStep });
    }
  };

  const handleSelectStepTab = (targetStep: ExtensionWizardStep) => {
    if (targetStep === draft.step) return;
    if (targetStep < draft.step) {
      setErrors({});
      setSubmitError(null);
      updateDraft({ step: targetStep });
      return;
    }
    // Validate intermediate steps before jumping forward
    for (let s = 1; s < targetStep; s++) {
      const stepErr = validateWizardStep(s as ExtensionWizardStep, draft, openOrders);
      if (Object.keys(stepErr).length > 0) {
        setErrors(stepErr);
        updateDraft({ step: s as ExtensionWizardStep });
        return;
      }
    }
    setErrors({});
    setSubmitError(null);
    updateDraft({ step: targetStep });
  };

  const handleResetDraft = () => {
    const defaultOrderId = openOrders[0]?.id ?? '';
    setDraft(createEmptyExtensionDraft(defaultOrderId));
    setErrors({});
    setSubmitError(null);
    setSavedNotice(null);
    setSaveTrigger(0);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.step < 4) {
      handleNextStep();
      return;
    }

    const validation = validateAllWizardSteps(draft, openOrders);
    if (!validation.valid) {
      setErrors(validation.errors);
      if (validation.firstInvalidStep && validation.firstInvalidStep !== draft.step) {
        updateDraft({ step: validation.firstInvalidStep });
      }
      return;
    }

    setErrors({});
    setSubmitError(null);
    pendingDraftRef.current = { ...draft };
    setSaveTrigger((c) => c + 1);
  };

  const executeSave = async (): Promise<boolean> => {
    const snapDraft = pendingDraftRef.current;
    if (!snapDraft) return false;
    try {
      const res = await submitExtensionProduct(serverUrl, snapDraft);
      setSavedNotice({
        title: res.itemTitle,
        destinationLabel: res.destinationLabel,
      });
      void syncWithServer(serverUrl);
      return true;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to send item to server.');
      return false;
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const norm = normalizeServerUrl(settingsUrlInput);
    if (!norm.valid) {
      setSettingsUrlError(norm.error || 'Invalid URL.');
      return;
    }
    const granted = await requestServerHostPermission(norm.url);
    if (!granted) {
      setSettingsUrlError(
        'Browser permission denied for this host. Accept the access prompt to connect your server.'
      );
      return;
    }
    setSettingsUrlError(null);
    setServerUrl(norm.url);
    setSettingsUrlInput(norm.url);
    await saveServerUrlPreference(norm.url);
    await syncWithServer(norm.url);
  };

  const handleOpenSidebar = async () => {
    const ok = await openExtensionSidebar();
    if (ok && !sidebarMode) {
      window.close();
    }
  };

  const selectedOrder =
    openOrders.find((o) => o.id === draft.selectedOrderId) ?? openOrders[0] ?? null;
  const exchangeRate = selectedOrder?.exchangeRate ?? DEFAULT_CNY_TO_EUR_RATE;
  const numericPrice = Number(draft.priceCny.replace(',', '.'));
  const convertedEstimate =
    Number.isFinite(numericPrice) && numericPrice > 0
      ? convertCnyToCurrency(numericPrice, exchangeRate, 'EUR')
      : null;

  const detectedPlatform = detectPlatformFromUrl(draft.link);
  const primaryImage = draft.imagePreviews[0] ?? '';
  const currentStepMeta = WIZARD_STEPS[draft.step - 1];
  const isSavedTarget = draft.step === 4 && draft.targetMode === 'saved';

  const containerSizeClass = sidebarMode
    ? 'w-full h-screen border-0 shadow-none'
    : 'w-[420px] max-w-full min-h-[580px] max-h-[600px] border-x sm:border border-[#E5E5E0] dark:border-[#2C2C2A] shadow-sm';

  return (
    <div
      className={
        sidebarMode
          ? 'w-full h-screen bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] overflow-hidden'
          : 'min-h-screen w-full bg-[#F7F7F5] dark:bg-[#0D0D0C] text-[#111110] dark:text-[#F4F4F0] flex justify-center'
      }
    >
      <div
        className={`${containerSizeClass} bg-white dark:bg-[#191918] flex flex-col overflow-hidden`}
      >
        {/* Header matching AddProductModal */}
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#E5E5E0] dark:border-[#2C2C2A] shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0] truncate">
                {showSettings
                  ? 'Extension Settings'
                  : isSavedTarget
                  ? 'Save Item for Later'
                  : 'Add New Item'}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[#6E6E68] dark:text-[#9A9A92] truncate">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                  connectionStatus === 'connected'
                    ? 'bg-[#16A34A]'
                    : connectionStatus === 'checking'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-[#DC2626]'
                }`}
              />
              <span className="truncate">
                {connectionStatus === 'connected'
                  ? selectedOrder
                    ? `Connected · ${selectedOrder.title}`
                    : 'Connected · No active order'
                  : connectionStatus === 'checking'
                  ? `Connecting to ${serverUrl}...`
                  : 'Server unreachable'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsDarkMode((d) => !d)}
              aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              title={isDarkMode ? 'Light theme' : 'Dark theme'}
              className="p-2 rounded-lg text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] hover:bg-[#EFEFEA] dark:hover:bg-[#242422] transition-colors cursor-pointer"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {showSidebarAction && (
              <button
                type="button"
                onClick={handleOpenSidebar}
                aria-label="Open in Firefox sidebar"
                title="Open in sidebar (stays open while browsing)"
                className="p-2 rounded-lg text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] hover:bg-[#EFEFEA] dark:hover:bg-[#242422] transition-colors cursor-pointer"
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              aria-label={showSettings ? 'Back to form' : 'Open server settings'}
              aria-pressed={showSettings}
              title="HaulDesk server settings"
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                showSettings
                  ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110]'
                  : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] hover:bg-[#EFEFEA] dark:hover:bg-[#242422]'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {showSettings ? (
          /* Server URL Settings Panel */
          <form onSubmit={handleSaveSettings} className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="ext-server-url"
                className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0]"
              >
                HaulDesk Server URL
              </label>
              <input
                id="ext-server-url"
                type="url"
                value={settingsUrlInput}
                onChange={(e) => {
                  setSettingsUrlInput(e.target.value);
                  setSettingsUrlError(null);
                }}
                placeholder="http://localhost:3000"
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
              />
              {settingsUrlError && (
                <p className="text-xs text-[#DC2626] dark:text-[#F87171]">{settingsUrlError}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSettingsUrlInput(DEFAULT_EXTENSION_SERVER_URL)}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-[#EFEFEA] dark:bg-[#242422] hover:bg-[#E5E5E0] dark:hover:bg-[#30302C] text-[#52524E] dark:text-[#B4B4AC] cursor-pointer"
                >
                  {DEFAULT_EXTENSION_SERVER_URL}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <TactileButton type="submit" variant="dark" size="sm" className="flex-1">
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    connectionStatus === 'checking' ? 'animate-spin' : ''
                  }`}
                />
                Save & Test Connection
              </TactileButton>
              <TactileButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void openExternalUrl(serverUrl)}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Web App
              </TactileButton>
            </div>

            {/* Connection Status & Diagnostics */}
            <div
              className={`rounded-xl border p-3 text-xs space-y-1.5 ${
                connectionStatus === 'connected'
                  ? 'border-[#BBF7D0] dark:border-[#14532D] bg-[#F0FDF4] dark:bg-[#0D2818] text-[#166534] dark:text-[#86EFAC]'
                  : connectionStatus === 'checking'
                  ? 'border-[#E5E5E0] dark:border-[#343430] bg-[#F7F7F5] dark:bg-[#222220] text-[#52524E] dark:text-[#B4B4AC]'
                  : 'border-[#FECACA] dark:border-[#7F1D1D] bg-[#FEF2F2] dark:bg-[#3A161A] text-[#B91C1C] dark:text-[#FCA5A5]'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {connectionStatus === 'connected' ? (
                  <Wifi className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {connectionStatus === 'connected'
                    ? 'Connection active'
                    : connectionStatus === 'checking'
                    ? 'Checking connection...'
                    : 'Connection failed'}
                </span>
              </div>
              {connectionStatus === 'connected' ? (
                <p className="text-[11px] opacity-90">
                  {openOrders.length > 0
                    ? `Active order ready: "${openOrders[0].title}". ${existingVendors.length} vendors in directory.`
                    : `Server reachable (${existingVendors.length} vendors in directory), but no active orders right now.`}
                </p>
              ) : connectionError ? (
                <p className="text-[11px] leading-relaxed">{connectionError}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[#F7F7F5] dark:bg-[#222220] border border-[#E5E5E0] dark:border-[#343430]">
              <div>
                <p className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0]">
                  Appearance
                </p>
                <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
                  {isDarkMode ? 'Dark mode enabled' : 'Light mode enabled'}
                </p>
              </div>
              <SwitchMode isDark={isDarkMode} onToggle={setIsDarkMode} />
            </div>

            <div className="rounded-xl border border-[#E5E5E0] dark:border-[#343430] bg-[#F7F7F5] dark:bg-[#222220] p-3 space-y-1.5 text-[11px] text-[#52524E] dark:text-[#B4B4AC]">
              <p className="font-semibold text-[#111110] dark:text-[#F4F4F0]">
                Self-signed HTTPS certificates in Firefox
              </p>
              <p className="leading-relaxed">
                If you connect the extension to a self-hosted instance over local HTTPS with a self-signed certificate, import your CA certificate in Firefox (Settings → Privacy & Security → Certificates) or set <span className="font-mono">security.enterprise_roots.enabled</span> to <span className="font-mono">true</span> in <span className="font-mono">about:config</span>.
              </p>
            </div>

            <div className="rounded-xl border border-[#E5E5E0] dark:border-[#343430] bg-[#F7F7F5] dark:bg-[#222220] p-3 text-[11px] text-[#6E6E68] dark:text-[#9A9A92] leading-relaxed">
              English is currently the default application language. Additional language support is planned for future releases.
            </div>

            <div className="pt-1 flex justify-end">
              <TactileButton
                type="button"
                variant="dark"
                size="sm"
                onClick={() => setShowSettings(false)}
              >
                Back to Form
              </TactileButton>
            </div>
          </form>
        ) : savedNotice ? (
          /* Save Confirmation */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className="w-14 h-14 rounded-full bg-[#16A34A]/15 text-[#16A34A] flex items-center justify-center"
            >
              <Check className="w-7 h-7 stroke-[2.5]" />
            </motion.div>

            <div className="space-y-1">
              <h2 className="text-base font-bold text-[#111110] dark:text-[#F4F4F0]">
                Item sent to HaulDesk!
              </h2>
              <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] max-w-xs">
                <span className="font-semibold text-[#111110] dark:text-[#F4F4F0]">
                  {savedNotice.title}
                </span>{' '}
                was saved to{' '}
                <span className="font-semibold text-[#E11D48]">
                  {savedNotice.destinationLabel}
                </span>
                .
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2 w-full max-w-xs">
              <TactileButton
                type="button"
                variant="dark"
                className="w-full"
                onClick={handleResetDraft}
              >
                Add Another Item
              </TactileButton>
              <TactileButton
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void openExternalUrl(serverUrl)}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open HaulDesk
              </TactileButton>
            </div>
          </div>
        ) : (
          /* 4-Step Wizard */
          <form onSubmit={handleSubmitForm} className="flex-1 flex flex-col min-h-0">
            {/* Stepper bar */}
            <nav
              aria-label="Add item steps"
              className="px-4 py-2.5 bg-[#F7F7F5] dark:bg-[#141413] border-b border-[#E5E5E0] dark:border-[#2C2C2A] shrink-0"
            >
              <div className="grid grid-cols-4 gap-1.5">
                {WIZARD_STEPS.map((s) => {
                  const isActive = draft.step === s.step;
                  const isCompleted = draft.step > s.step;
                  return (
                    <button
                      key={s.step}
                      type="button"
                      onClick={() => handleSelectStepTab(s.step)}
                      aria-current={isActive ? 'step' : undefined}
                      className={`flex items-center justify-center gap-1.5 px-1.5 py-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                        isActive
                          ? 'border-[#111110] dark:border-[#F4F4F0] bg-white dark:bg-[#242422] shadow-2xs'
                          : isCompleted
                          ? 'border-[#E5E5E0] dark:border-[#2C2C2A] bg-white/60 dark:bg-[#1D1D1B] text-[#111110] dark:text-[#F4F4F0]'
                          : 'border-transparent bg-transparent text-[#6E6E68] dark:text-[#9A9A92] hover:bg-[#EFEFEA] dark:hover:bg-[#222220]'
                      }`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold shrink-0 ${
                          isActive
                            ? 'bg-[#E11D48] text-white'
                            : isCompleted
                            ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110]'
                            : 'bg-[#E5E5E0] dark:bg-[#2C2C2A] text-[#52524E] dark:text-[#9A9A92]'
                        }`}
                      >
                        {isCompleted ? <Check className="w-2.5 h-2.5" /> : s.step}
                      </span>
                      <span className="text-[11px] font-semibold whitespace-nowrap">
                        {s.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] mt-2 leading-snug">
                <span className="font-semibold text-[#111110] dark:text-[#F4F4F0]">
                  Step {currentStepMeta.step}/4 · {currentStepMeta.title}:
                </span>{' '}
                {currentStepMeta.subtitle}
              </p>
            </nav>

            {/* Non-blocking server connection warning */}
            {connectionStatus === 'error' && (
              <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-[#FEF2F2] dark:bg-[#3A161A] border border-[#FECACA] dark:border-[#7F1D1D] flex items-center justify-between gap-2 text-[11px] text-[#B91C1C] dark:text-[#FCA5A5] shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Server unreachable ({serverUrl})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="font-semibold underline shrink-0 cursor-pointer"
                >
                  Check
                </button>
              </div>
            )}

            {/* Step scroll body */}
            <div
              className={`flex-1 overflow-y-auto p-4 ${
                sidebarMode ? 'sm:p-5 flex flex-col gap-5' : 'space-y-4'
              }`}
            >
              <AnimatePresence mode="wait" initial={false}>
                {draft.step === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.14 }}
                    className="space-y-4"
                  >
                    {/* Product Photos */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0]">
                          1. Product Photos (Yupoo / Taobao)
                        </span>
                        <span className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                          {draft.imagePreviews.length > 0
                            ? `${draft.imagePreviews.length} / 8 photos`
                            : 'Drag, upload, or Ctrl+V'}
                        </span>
                      </div>

                      <div
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dragDepthRef.current += 1;
                          setDragOver(true);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                          if (!dragOver) setDragOver(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                          if (dragDepthRef.current === 0) setDragOver(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dragDepthRef.current = 0;
                          setDragOver(false);
                          void (async () => {
                            const { files, urls } = extractDroppedImageInput(e.dataTransfer);
                            const collected: Blob[] = [...files];
                            if (urls.length > 0) {
                              const fetched = await resolveImageUrlsToBlobs(urls, serverUrl);
                              collected.push(...fetched);
                            }
                            if (collected.length > 0) {
                              await processImageBlobs(collected);
                            } else {
                              setSubmitError('No valid image detected from drag and drop.');
                            }
                          })();
                        }}
                        className={`relative rounded-2xl border-2 border-dashed transition-colors ${
                          sidebarMode ? 'p-4' : 'p-3.5'
                        } ${
                          dragOver
                            ? 'border-[#E11D48] bg-[#FFF1F2] dark:bg-[#3A1620]'
                            : 'border-[#D6D6CF] dark:border-[#343430] bg-[#F7F7F5] dark:bg-[#222220]'
                        }`}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="sr-only"
                          aria-label="Upload one or more product photos"
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []).filter((f) =>
                              isLikelyImageFile(f)
                            );
                            if (files.length > 0) void processImageBlobs(files);
                            e.target.value = '';
                          }}
                        />

                        <div className="flex items-center gap-3.5">
                          {primaryImage ? (
                            <div
                              className={`relative rounded-xl overflow-hidden border border-[#E5E5E0] dark:border-[#343430] bg-white dark:bg-[#191918] shrink-0 ${
                                sidebarMode ? 'w-20 h-20' : 'w-16 h-16'
                              }`}
                            >
                              <img
                                src={primaryImage}
                                alt="Product preview"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div
                              className={`rounded-xl border border-[#E5E5E0] dark:border-[#343430] bg-white dark:bg-[#191918] flex items-center justify-center text-[#6E6E68] dark:text-[#9A9A92] shrink-0 ${
                                sidebarMode ? 'w-20 h-20' : 'w-16 h-16'
                              }`}
                            >
                              <Upload className="w-5 h-5" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0 space-y-2">
                            <p className="text-[11px] text-[#52524E] dark:text-[#B4B4AC] leading-snug">
                              Upload one or more screenshots or press{' '}
                              <kbd className="px-1 py-0.5 text-[10px] font-mono bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] rounded">
                                Ctrl+V
                              </kbd>
                              .
                            </p>
                            <TactileButton
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <Upload className="w-3.5 h-3.5" />
                              {draft.imagePreviews.length > 0
                                ? 'Add More Photos'
                                : 'Choose Photos'}
                            </TactileButton>
                          </div>
                        </div>

                        {draft.imagePreviews.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-[#E5E5E0] dark:border-[#343430]">
                            <ScrollFadeList
                              items={draft.imagePreviews.map((url, idx) => ({ url, idx }))}
                              getKey={(item) => `${item.idx}-${item.url.slice(0, 24)}`}
                              maxFadeHeight={24}
                              scrollClassName={`${
                                sidebarMode ? 'max-h-60' : 'max-h-36'
                              } overflow-y-auto overscroll-contain`}
                              renderItem={(item) => (
                                <div
                                  className={`flex items-center justify-between gap-2 p-1.5 rounded-xl border ${
                                    item.idx === 0
                                      ? 'border-[#E11D48] bg-[#FFF1F2] dark:bg-[#3A1620]'
                                      : 'border-[#E5E5E0] dark:border-[#343430] bg-white dark:bg-[#1E1E1C]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <img
                                      src={item.url}
                                      alt={`Photo ${item.idx + 1}`}
                                      className="w-9 h-9 rounded-lg object-cover shrink-0"
                                    />
                                    <span className="text-[11px] font-semibold text-[#111110] dark:text-[#F4F4F0] truncate">
                                      {item.idx === 0 ? 'Primary Cover' : `Photo ${item.idx + 1}`}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {item.idx !== 0 && (
                                      <button
                                        type="button"
                                        onClick={() => handleSetPrimaryImage(item.idx)}
                                        className="px-2 py-1 text-[10px] font-medium rounded-lg bg-[#EFEFEA] dark:bg-[#2A2A27] text-[#111110] dark:text-[#F4F4F0] hover:bg-[#E5E5E0] dark:hover:bg-[#32322F] cursor-pointer"
                                      >
                                        Set Cover
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveImage(item.idx)}
                                      aria-label={`Remove photo ${item.idx + 1}`}
                                      className="p-1 rounded-lg text-[#8E8E87] hover:text-[#DC2626] hover:bg-[#FEF2F2] dark:hover:bg-[#3A161A] cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Item Name */}
                    <div>
                      <label
                        htmlFor="ext-product-title"
                        className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
                      >
                        2. Item Name
                      </label>
                      <input
                        id="ext-product-title"
                        type="text"
                        value={draft.title}
                        onChange={(e) => {
                          updateDraft({ title: e.target.value });
                          if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
                        }}
                        placeholder="e.g. Boxy Fit Washed Charcoal Hoodie"
                        className="w-full px-3.5 py-2.5 text-sm bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                      />
                      {errors.title && (
                        <p className="text-xs text-[#DC2626] dark:text-[#F87171] mt-1">
                          {errors.title}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}

                {draft.step === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.14 }}
                    className="space-y-4"
                  >
                    <div>
                      <span className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-2">
                        Item Category
                      </span>
                      <div
                        className={`grid gap-2 ${
                          sidebarMode ? 'grid-cols-2 min-[500px]:grid-cols-3' : 'grid-cols-2'
                        }`}
                      >
                        {PRODUCT_CATEGORIES.map((cat) => {
                          const selected = draft.category === cat.id;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => {
                                updateDraft({ category: cat.id });
                                if (errors.category) {
                                  setErrors((prev) => ({ ...prev, category: undefined }));
                                }
                              }}
                              aria-pressed={selected}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] ${
                                selected
                                  ? 'border-[#111110] dark:border-[#F4F4F0] bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] shadow-sm'
                                  : 'border-[#E5E5E0] dark:border-[#343430] bg-white dark:bg-[#222220] hover:bg-[#F7F7F5] dark:hover:bg-[#2C2C2A] text-[#111110] dark:text-[#F4F4F0]'
                              }`}
                            >
                              <CategoryIcon
                                category={cat.id}
                                active={selected}
                                className="w-4 h-4 shrink-0"
                              />
                              <span className="text-xs font-medium truncate">
                                {cat.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {errors.category && (
                        <p className="text-xs text-[#DC2626] dark:text-[#F87171] mt-1.5">
                          {errors.category}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="ext-product-price"
                        className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
                      >
                        Price (¥ CNY)
                      </label>
                      <div className="relative">
                        <input
                          id="ext-product-price"
                          type="text"
                          inputMode="decimal"
                          value={draft.priceCny}
                          onChange={(e) => {
                            updateDraft({ priceCny: e.target.value });
                            if (errors.priceCny) {
                              setErrors((prev) => ({ ...prev, priceCny: undefined }));
                            }
                          }}
                          placeholder="e.g. 240"
                          className="w-full pl-3.5 pr-24 py-2.5 text-sm font-mono tabular-nums bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                          {convertedEstimate !== null
                            ? `≈ ${formatCurrency(convertedEstimate, 'EUR')}`
                            : 'CNY'}
                        </span>
                      </div>
                      {errors.priceCny && (
                        <p className="text-xs text-[#DC2626] dark:text-[#F87171] mt-1">
                          {errors.priceCny}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}

                {draft.step === 3 && (
                  <motion.div
                    key="step-3"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.14 }}
                    className="space-y-4"
                  >
                    {/* Product Link (optional) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label
                          htmlFor="ext-product-link"
                          className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0]"
                        >
                          Product Link (Optional)
                        </label>
                        {draft.link.trim() && (
                          <span className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92] flex items-center gap-1">
                            <Link2 className="w-3 h-3" />
                            {PLATFORM_LABELS[detectedPlatform]}
                          </span>
                        )}
                      </div>
                      <input
                        id="ext-product-link"
                        type="url"
                        value={draft.link}
                        onChange={(e) => handleLinkChange(e.target.value)}
                        placeholder="https://item.taobao.com/item.htm?id=..."
                        className="w-full px-3.5 py-2.5 text-sm bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                      />
                      {errors.link && (
                        <p className="text-xs text-[#DC2626] dark:text-[#F87171] mt-1">
                          {errors.link}
                        </p>
                      )}
                    </div>

                    {/* Vendor */}
                    <div>
                      <label
                        htmlFor="ext-product-vendor"
                        className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
                      >
                        Vendor / Seller
                      </label>
                      <input
                        id="ext-product-vendor"
                        type="text"
                        value={draft.vendor}
                        onChange={(e) => {
                          updateDraft({ vendor: e.target.value });
                          if (errors.vendor) {
                            setErrors((prev) => ({ ...prev, vendor: undefined }));
                          }
                        }}
                        placeholder="e.g. TopStoney, AAAABull, WWTOP"
                        className="w-full px-3.5 py-2.5 text-sm bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                      />
                      {existingVendors.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {existingVendors.slice(0, 6).map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => {
                                updateDraft({ vendor: v });
                                if (errors.vendor) {
                                  setErrors((prev) => ({ ...prev, vendor: undefined }));
                                }
                              }}
                              className="text-[11px] px-2 py-0.5 rounded-md bg-[#EFEFEA] dark:bg-[#242422] hover:bg-[#E5E5E0] dark:hover:bg-[#30302C] text-[#52524E] dark:text-[#B4B4AC] hover:text-[#111110] dark:hover:text-[#F4F4F0] transition-colors cursor-pointer"
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      )}
                      {errors.vendor && (
                        <p className="text-xs text-[#DC2626] dark:text-[#F87171] mt-1">
                          {errors.vendor}
                        </p>
                      )}
                    </div>

                    {/* Size / Notes */}
                    <div>
                      <label
                        htmlFor="ext-product-size"
                        className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
                      >
                        Size / Notes
                      </label>
                      <div className="relative">
                        <Tag className="w-3.5 h-3.5 text-[#8E8E87] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          id="ext-product-size"
                          type="text"
                          value={draft.sizeNote}
                          onChange={(e) => updateDraft({ sizeNote: e.target.value })}
                          placeholder="e.g. L · Black"
                          className="w-full pl-8 pr-3 py-2.5 text-sm bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {draft.step === 4 && (
                  <motion.div
                    key="step-4"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.14 }}
                    className="space-y-4"
                  >
                    {/* Destination Switch matching AddProductModal */}
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F7F7F5] dark:bg-[#222220] border border-[#E5E5E0] dark:border-[#343430]">
                      <span className="text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] pl-1">
                        Destination
                      </span>
                      <div className="inline-flex items-center p-1 bg-[#EFEFEA] dark:bg-[#191918] rounded-xl">
                        <button
                          type="button"
                          onClick={() => {
                            updateDraft({ targetMode: 'order' });
                            setErrors((prev) => ({ ...prev, target: undefined }));
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                            draft.targetMode === 'order'
                              ? 'bg-white dark:bg-[#2A2A27] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                              : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                          }`}
                        >
                          <Package className="w-3.5 h-3.5" />
                          Active Order
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updateDraft({ targetMode: 'saved' });
                            setErrors((prev) => ({ ...prev, target: undefined }));
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                            draft.targetMode === 'saved'
                              ? 'bg-white dark:bg-[#2A2A27] text-[#E11D48] shadow-xs'
                              : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                          }`}
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          Save for Later
                        </button>
                      </div>
                    </div>

                    {draft.targetMode === 'order' ? (
                      openOrders.length > 0 ? (
                        <div className="rounded-xl border border-[#E5E5E0] dark:border-[#343430] bg-white dark:bg-[#222220] p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-[#6E6E68] dark:text-[#9A9A92] uppercase tracking-wider">
                              Destination Active Order
                            </span>
                            <button
                              type="button"
                              onClick={() => void syncWithServer(serverUrl)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#52524E] dark:text-[#B4B4AC] hover:text-[#111110] dark:hover:text-[#F4F4F0] cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Refresh
                            </button>
                          </div>

                          {openOrders.length === 1 ? (
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0] truncate">
                                  {openOrders[0].title}
                                </p>
                                <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] font-mono">
                                  Rate: 1 ¥ = €{openOrders[0].exchangeRate.toFixed(2)}
                                </p>
                              </div>
                              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-[#F0FDF4] dark:bg-[#0D2818] text-[#16A34A] border border-[#BBF7D0] dark:border-[#14532D] shrink-0">
                                Active
                              </span>
                            </div>
                          ) : (
                            <select
                              aria-label="Select active order"
                              value={draft.selectedOrderId || openOrders[0].id}
                              onChange={(e) =>
                                updateDraft({ selectedOrderId: e.target.value })
                              }
                              className="w-full px-3 py-2 text-sm bg-[#F7F7F5] dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] focus:outline-none"
                            >
                              {openOrders.map((ord) => (
                                <option key={ord.id} value={ord.id}>
                                  {ord.title}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-2 text-xs text-amber-900 dark:text-amber-200">
                          <p className="font-semibold">
                            No active order available
                          </p>
                          <p className="text-[11px] opacity-90">
                            {connectionStatus === 'error'
                              ? 'Check your connection in Settings or choose "Save for Later".'
                              : 'There are no open orders on the server. You can save this item to "Save for Later" and move it into an order anytime.'}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              updateDraft({ targetMode: 'saved' });
                              setErrors((prev) => ({ ...prev, target: undefined }));
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#222220] border border-amber-300 dark:border-amber-700 text-[11px] font-semibold text-[#111110] dark:text-[#F4F4F0] cursor-pointer"
                          >
                            <Bookmark className="w-3.5 h-3.5 text-[#E11D48]" />
                            Switch to Save for Later
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="rounded-xl border border-[#E5E5E0] dark:border-[#343430] bg-[#FFF1F2]/60 dark:bg-[#3A1620]/30 p-3 text-xs text-[#52524E] dark:text-[#D4D4CC]">
                        This item will be added to your{' '}
                        <span className="font-semibold text-[#E11D48]">Save for Later</span>{' '}
                        list so you can move it to any open order inside HaulDesk.
                      </div>
                    )}

                    {errors.target && (
                      <p className="text-xs text-[#DC2626] dark:text-[#F87171]">
                        {errors.target}
                      </p>
                    )}

                    {/* Item Summary */}
                    <div className="rounded-xl border border-[#E5E5E0] dark:border-[#343430] bg-[#F7F7F5] dark:bg-[#222220] p-3 space-y-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6E6E68] dark:text-[#9A9A92]">
                        Item Summary
                      </span>
                      <div className="flex items-center gap-3">
                        {primaryImage ? (
                          <img
                            src={primaryImage}
                            alt={draft.title || 'Preview'}
                            className="w-12 h-12 rounded-xl object-cover border border-[#E5E5E0] dark:border-[#343430] shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl border border-[#E5E5E0] dark:border-[#343430] bg-white dark:bg-[#191918] flex items-center justify-center text-[#6E6E68] dark:text-[#9A9A92] shrink-0">
                            {draft.category ? (
                              <CategoryIcon category={draft.category} className="w-5 h-5" />
                            ) : (
                              <Package className="w-5 h-5" />
                            )}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-[#111110] dark:text-[#F4F4F0] truncate">
                            {draft.title || '—'}
                          </p>
                          <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] truncate">
                            {draft.category ? getCategoryLabel(draft.category) : 'Category'} · {draft.vendor || 'Vendor'}
                            {draft.sizeNote.trim() ? ` · ${draft.sizeNote.trim()}` : ''}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs font-mono tabular-nums">
                            <span className="font-bold text-[#111110] dark:text-[#F4F4F0]">
                              ¥{draft.priceCny || '0'}
                            </span>
                            {convertedEstimate !== null && (
                              <span className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
                                (≈ {formatCurrency(convertedEstimate, 'EUR')})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {sidebarMode && draft.step < 4 && (
                <div
                  data-testid="sidebar-live-preview"
                  className="mt-auto rounded-xl border border-[#E5E5E0] dark:border-[#343430] bg-[#F7F7F5] dark:bg-[#222220] p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6E6E68] dark:text-[#9A9A92]">
                      Live Item Preview
                    </span>
                    <span className="text-[10px] font-mono text-[#6E6E68] dark:text-[#9A9A92]">
                      {draft.imagePreviews.length > 0
                        ? `${draft.imagePreviews.length} ${draft.imagePreviews.length === 1 ? 'photo' : 'photos'}`
                        : 'No photos'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {primaryImage ? (
                      <img
                        src={primaryImage}
                        alt={draft.title || 'Preview'}
                        className="w-14 h-14 rounded-xl object-cover border border-[#E5E5E0] dark:border-[#343430] shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl border border-[#E5E5E0] dark:border-[#343430] bg-white dark:bg-[#191918] flex items-center justify-center text-[#6E6E68] dark:text-[#9A9A92] shrink-0">
                        {draft.category ? (
                          <CategoryIcon category={draft.category} className="w-5 h-5" />
                        ) : (
                          <Package className="w-5 h-5" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-xs font-bold text-[#111110] dark:text-[#F4F4F0] truncate">
                        {draft.title.trim() || 'Item name not entered'}
                      </p>
                      <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] truncate">
                        {draft.category ? getCategoryLabel(draft.category) : 'Category'} · {draft.vendor.trim() || 'Vendor'}
                        {draft.sizeNote.trim() ? ` · ${draft.sizeNote.trim()}` : ''}
                      </p>
                      <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                        <span className="font-bold text-[#111110] dark:text-[#F4F4F0]">
                          ¥{draft.priceCny.trim() || '0'}
                        </span>
                        {convertedEstimate !== null && (
                          <span className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
                            (≈ {formatCurrency(convertedEstimate, 'EUR')})
                          </span>
                        )}
                        {draft.link.trim() && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430]">
                            {PLATFORM_LABELS[detectedPlatform]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {submitError && (
                <p className="text-xs text-[#DC2626] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#3A161A] border border-[#FECACA] dark:border-[#7F1D1D] rounded-xl px-3.5 py-2.5">
                  {submitError}
                </p>
              )}
            </div>

            {/* Footer Actions */}
            <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[#E5E5E0] dark:border-[#2C2C2A] bg-white dark:bg-[#191918] shrink-0">
              {draft.step === 1 ? (
                <button
                  type="button"
                  onClick={handleResetDraft}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] rounded-lg hover:bg-[#EFEFEA] dark:hover:bg-[#242422] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear
                </button>
              ) : (
                <TactileButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePrevStep}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </TactileButton>
              )}

              {draft.step < 4 ? (
                <TactileButton type="submit" variant="dark" size="sm">
                  Next
                  <ArrowRight className="w-3.5 h-3.5" />
                </TactileButton>
              ) : (
                <SaveToggle
                  type="submit"
                  size="xs"
                  idleText="Save Item"
                  savedText="Saved"
                  idleWidth={138}
                  savedWidth={114}
                  autoResetDelay={0}
                  triggerCount={saveTrigger}
                  onSave={executeSave}
                />
              )}
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
