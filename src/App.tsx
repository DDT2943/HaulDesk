import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Package, Trash2, CheckCircle2, Clock, HardDrive } from 'lucide-react';
import type {
  HaulDatabaseState,
  HaulOrder,
  ProductCategory,
  ProductDraftInput,
  TrackingMilestone,
} from './types/haul';
import {
  calculateOrderTotals,
  convertEurToCurrency,
  extractUniqueVendors,
  formatCny,
  formatCurrency,
  formatShortDate,
  generateHaulCsv,
  isDisplayCurrencyCode,
  type DisplayCurrencyCode,
} from './utils/haulLogic';
import { TactileButton } from './components/TactileButtons';
import { SwitchMode } from './components/SwitchMode';
import {
  OrderDetailView,
  type OrderBulkActionPayload,
} from './components/OrderDetailView';
import { OrderReceipt } from './components/OrderReceipt';
import { ReceiptPrinterModal } from './components/ReceiptPrinterModal';
import { CategorySpendChart } from './components/SpendCharts';
import { NewOrderModal } from './components/NewOrderModal';
import { AddProductModal } from './components/AddProductModal';
import { BackupModal } from './components/BackupModal';
import { VendorsView } from './components/VendorsView';
import { AnalyticsView } from './components/AnalyticsView';
import { ShippingCalculatorView } from './components/ShippingCalculatorView';
import { ConcludedOrdersView } from './components/ConcludedOrdersView';
import { WardrobeView } from './components/WardrobeView';
import {
  SavedForLaterView,
  type SavedBulkActionPayload,
} from './components/SavedForLaterView';
import type { EditProductPatch } from './components/EditProductModal';
import { DEMO_CURRENCIES, SwapCurrencyCard } from './components/SwapCurrencyCard';
import { FluidTabs } from './components/FluidTabs';
import { OrderTrackingPanel } from './components/OrderTrackingPanel';
import { TimedUndoAction } from './components/TimedUndoAction';
import { FaBookmark, FaInbox, FaLandmark, FaStore, FaTruck, FaTshirt } from 'react-icons/fa';
import { BiSolidPieChartAlt2 } from 'react-icons/bi';

type MainTab =
  | 'ordini'
  | 'salvati'
  | 'conclusi'
  | 'armadio'
  | 'vendor'
  | 'statistiche'
  | 'spedizione';
type OrderFilter = 'all' | 'open' | 'concluded';

const THEME_STORAGE_KEY = 'hauldesk-theme';
const DISPLAY_CURRENCY_STORAGE_KEY = 'hauldesk-display-currency';

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return isDesktop;
}

export default function App() {
  const isDesktop = useIsDesktop();
  const [db, setDb] = useState<HaulDatabaseState>({ orders: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrencyCode>(() => {
    try {
      const saved = window.localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY);
      if (saved && isDisplayCurrencyCode(saved)) {
        return saved;
      }
    } catch {
      // Ignore storage access errors in restricted frames
    }
    return 'EUR';
  });

  const [mainTab, setMainTab] = useState<MainTab>('ordini');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ProductCategory | 'All'>('All');
  const [pendingDeleteOrderId, setPendingDeleteOrderId] = useState<string | null>(null);

  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductMode, setAddProductMode] = useState<'order' | 'saved'>('order');
  const [backupOpen, setBackupOpen] = useState(false);
  const [printerOrderId, setPrinterOrderId] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDarkMode);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage access errors in restricted frames
    }
  }, [isDarkMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, displayCurrency);
    } catch {
      // Ignore storage access errors in restricted frames
    }
  }, [displayCurrency]);

  const loadState = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch('/api/state');
      if (!res.ok) {
        throw new Error('Unable to load orders from the server.');
      }
      const data = (await res.json()) as HaulDatabaseState;
      setDb(data);
      setSelectedOrderId((prev) => {
        if (prev && data.orders.some((o) => o.id === prev)) return prev;
        const firstOpen = data.orders.find((o) => o.status === 'open');
        return firstOpen?.id ?? data.orders[0]?.id ?? null;
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
  }, []);

  // Prevent browser tab navigation when a dragged file/image lands slightly outside a modal dropzone
  useEffect(() => {
    const preventNav = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventNav);
    window.addEventListener('drop', preventNav);
    return () => {
      window.removeEventListener('dragover', preventNav);
      window.removeEventListener('drop', preventNav);
    };
  }, []);

  const filteredOrders = useMemo(() => {
    if (orderFilter === 'all') return db.orders;
    return db.orders.filter((o) => o.status === orderFilter);
  }, [db.orders, orderFilter]);

  const handleSelectOrderFilter = (nextFilter: OrderFilter) => {
    setOrderFilter(nextFilter);
    if (!isDesktop) return;
    const nextList =
      nextFilter === 'all'
        ? db.orders
        : db.orders.filter((o) => o.status === nextFilter);
    if (nextList.length === 0) {
      setSelectedOrderId(null);
      return;
    }
    if (!selectedOrderId || !nextList.some((o) => o.id === selectedOrderId)) {
      setSelectedOrderId(nextList[0].id);
      setActiveCategory('All');
    }
  };

  const activeOrder = useMemo(
    () => {
      if (selectedOrderId) {
        return db.orders.find((o) => o.id === selectedOrderId) ?? null;
      }
      return null;
    },
    [db.orders, selectedOrderId]
  );

  const activeOrderItems = useMemo(
    () => (activeOrder ? db.items.filter((it) => it.orderId === activeOrder.id) : []),
    [db.items, activeOrder]
  );

  const activeOrderMetrics = useMemo(
    () =>
      activeOrder
        ? calculateOrderTotals(activeOrderItems, activeOrder.exchangeRate)
        : null,
    [activeOrder, activeOrderItems]
  );

  const printerOrder = useMemo(
    () => (printerOrderId ? db.orders.find((o) => o.id === printerOrderId) ?? null : null),
    [db.orders, printerOrderId]
  );

  const printerOrderItems = useMemo(
    () => (printerOrder ? db.items.filter((it) => it.orderId === printerOrder.id) : []),
    [db.items, printerOrder]
  );

  const existingVendors = useMemo(
    () => extractUniqueVendors([...db.items, ...(db.savedItems ?? [])]),
    [db.items, db.savedItems]
  );

  const openOrders = useMemo(
    () => db.orders.filter((o) => o.status === 'open'),
    [db.orders]
  );

  const estimatedExchangeRate = useMemo(() => {
    if (typeof db.estimatedExchangeRate === 'number' && db.estimatedExchangeRate > 0) {
      return db.estimatedExchangeRate;
    }
    const firstOpen = db.orders.find((o) => o.status === 'open');
    return firstOpen?.exchangeRate ?? 0.13;
  }, [db.estimatedExchangeRate, db.orders]);

  const handleUpdateGlobalExchangeRate = async (exchangeRate: number) => {
    const res = await fetch('/api/exchange-rate', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exchangeRate }),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to update global exchange rate');
    }
    setDb(data.state);
  };

  const handleCreateOrder = async (payload: {
    title: string;
    agentNote: string;
    exchangeRate: number;
  }) => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      order?: { id: string };
      state?: HaulDatabaseState;
      error?: string;
    };
    if (!res.ok || !data.state || !data.order) {
      throw new Error(data.error || 'Failed to create new order');
    }
    setDb(data.state);
    setSelectedOrderId(data.order.id);
    setMainTab('ordini');
    setOrderFilter('all');
    setActiveCategory('All');
  };

  const handleConcludeOrder = async (orderId: string) => {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/conclude`, { method: 'PATCH' });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to conclude order');
    }
    setDb(data.state);
    setPrinterOrderId(orderId);
  };

  const handleReopenOrder = async (orderId: string) => {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/reopen`, { method: 'PATCH' });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to reopen order');
    }
    setDb(data.state);
  };

  const handleDeleteOrder = async (orderId: string) => {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to delete order');
    }
    setDb(data.state);
    if (selectedOrderId === orderId) {
      const next = data.state.orders[0]?.id ?? null;
      setSelectedOrderId(next);
    }
  };

  const handleUpdateTracking = async (
    orderId: string,
    payload: {
      trackingNumber: string;
      shippingLine: string;
      trackingStatus: TrackingMilestone;
      location?: string;
      note?: string;
    }
  ) => {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackingNumber: payload.trackingNumber,
        shippingLine: payload.shippingLine,
        trackingStatus: payload.trackingStatus,
        eventLocation: payload.location,
        eventNote: payload.note,
      }),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to update tracking');
    }
    setDb(data.state);
  };

  const handleSyncLiveTracking = async (
    orderId: string,
    trackingNumber: string
  ): Promise<{ liveFound: boolean; message: string }> => {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/tracking/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingNumber }),
    });
    const data = (await res.json()) as {
      state?: HaulDatabaseState;
      sync?: { liveFound: boolean; message: string };
      error?: string;
    };
    if (!res.ok || !data.state || !data.sync) {
      throw new Error(data.error || 'Failed to sync live tracking');
    }
    setDb(data.state);
    return {
      liveFound: data.sync.liveFound,
      message: data.sync.message,
    };
  };

  const handleUpdateItemImages = async (itemId: string, imageUrls: string[]) => {
    const clean = imageUrls.map((u) => u.trim()).filter(Boolean);
    const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: clean[0] ?? '',
        imageUrls: clean,
      }),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to update product photos');
    }
    setDb(data.state);
  };

  const handleUpdateOrderExchangeRate = async (
    orderId: string,
    exchangeRate: number
  ) => {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/rate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exchangeRate }),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to update conversion rate');
    }
    setDb(data.state);
  };

  const handleUpdateWardrobeItem = async (
    itemId: string,
    patch: { rating?: number | null; sizeNote?: string; detectedDetails?: string }
  ) => {
    const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to save wardrobe updates');
    }
    setDb(data.state);
  };

  const handleUpdateItem = async (itemId: string, patch: EditProductPatch) => {
    const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to update item');
    }
    setDb(data.state);
  };

  const triggerCsvDownload = (ordersSubset: HaulOrder[], filename: string) => {
    const csvContent = generateHaulCsv(ordersSubset, db.items);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleAddProduct = async (draft: ProductDraftInput) => {
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to add item');
    }
    setDb(data.state);
  };

  const handleDeleteItem = async (itemId: string) => {
    const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to delete item');
    }
    setDb(data.state);
  };

  const handleAddSavedProduct = async (draft: ProductDraftInput) => {
    const res = await fetch('/api/saved-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to save item for later');
    }
    setDb(data.state);
  };

  const handleSaveItemForLater = async (itemId: string) => {
    const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/save-for-later`, {
      method: 'POST',
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to move item to Save for Later');
    }
    setDb(data.state);
  };

  const handleMoveSavedToOrder = async (itemId: string, orderId: string) => {
    const res = await fetch(`/api/saved-items/${encodeURIComponent(itemId)}/move-to-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to move item to order');
    }
    setDb(data.state);
  };

  const handleUpdateSavedItem = async (itemId: string, patch: EditProductPatch) => {
    const res = await fetch(`/api/saved-items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to update saved item');
    }
    setDb(data.state);
  };

  const handleDeleteSavedItem = async (itemId: string) => {
    const res = await fetch(`/api/saved-items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to delete saved item');
    }
    setDb(data.state);
  };

  const handleOrderItemsBulkAction = async (payload: OrderBulkActionPayload) => {
    const res = await fetch('/api/items/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to perform bulk action');
    }
    setDb(data.state);
  };

  const handleSavedItemsBulkAction = async (payload: SavedBulkActionPayload) => {
    const res = await fetch('/api/saved-items/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { state?: HaulDatabaseState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to perform bulk action');
    }
    setDb(data.state);
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] dark:bg-[#121211] text-[#111110] dark:text-[#F4F4F0] transition-colors">
      {/* Top Bar Contract: 3 zones */}
      <header className="sticky top-0 z-30 bg-[#F7F7F5]/90 dark:bg-[#121211]/90 backdrop-blur-md border-b border-[#E5E5E0] dark:border-[#2C2C2A]">
        <div className="max-w-[1400px] mx-auto px-2 sm:px-6 h-16 flex items-center justify-between gap-1 sm:gap-6">
          {/* Zone 1: Single text element wordmark (hidden on mobile to keep top bar compact) */}
          <button
            type="button"
            onClick={() => setMainTab('ordini')}
            className="hidden sm:inline-flex text-lg font-extrabold tracking-tight text-[#111110] dark:text-[#F4F4F0] whitespace-nowrap shrink-0 cursor-pointer"
          >
            HaulDesk
          </button>

          <FluidTabs
            tabs={[
              { id: 'ordini', label: 'Orders', icon: <FaInbox size={15} /> },
              {
                id: 'salvati',
                label: (db.savedItems?.length ?? 0) > 0
                  ? `Save for Later (${db.savedItems?.length ?? 0})`
                  : 'Save for Later',
                icon: <FaBookmark size={14} />,
              },
              { id: 'conclusi', label: 'Concluded', icon: <FaLandmark size={15} /> },
              { id: 'armadio', label: 'Wardrobe', icon: <FaTshirt size={15} /> },
              { id: 'vendor', label: 'Vendors', icon: <FaStore size={15} /> },
              { id: 'statistiche', label: 'Analytics', icon: <BiSolidPieChartAlt2 size={15} /> },
              { id: 'spedizione', label: 'Shipping', icon: <FaTruck size={15} /> },
            ]}
            activeId={mainTab}
            onChange={(id) => setMainTab(id)}
          />

          {/* Zone 3: Theme SwitchMode + Secondary-Dark CTA */}
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            <SwitchMode
              width={40}
              height={22}
              darkColor="#111"
              lightColor="#F9F9F9"
              knobDarkColor="#1C1C1C"
              knobLightColor="#F3F3F7"
              borderDarkColor="#444"
              borderLightColor="#DDD"
              isDark={isDarkMode}
              onToggle={setIsDarkMode}
            />
            <TactileButton
              variant="secondary"
              size="sm"
              aria-label="Backup & Restore"
              className="!px-2 sm:!px-3"
              onClick={() => setBackupOpen(true)}
            >
              <HardDrive className="w-4 h-4" />
              <span className="hidden sm:inline">Backup</span>
            </TactileButton>
            <TactileButton
              variant="dark"
              size="sm"
              aria-label="New Order"
              className="!px-2 sm:!px-3"
              onClick={() => setNewOrderOpen(true)}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Order</span>
            </TactileButton>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)_310px] gap-6">
            <div className="h-72 rounded-2xl bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] animate-pulse" />
            <div className="h-96 rounded-2xl bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] animate-pulse" />
            <div className="h-72 rounded-2xl bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] animate-pulse" />
          </div>
        ) : loadError ? (
          <div className="bg-white dark:bg-[#191918] border border-[#FECACA] dark:border-[#7F1D1D] rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-[#DC2626] dark:text-[#F87171]">
              {loadError}
            </p>
            <TactileButton variant="secondary" onClick={() => void loadState()}>
              Retry
            </TactileButton>
          </div>
        ) : mainTab === 'salvati' ? (
          <SavedForLaterView
            savedItems={db.savedItems ?? []}
            openOrders={openOrders}
            existingVendors={existingVendors}
            displayCurrency={displayCurrency}
            estimatedExchangeRate={estimatedExchangeRate}
            onOpenAddSavedProduct={() => {
              setAddProductMode('saved');
              setAddProductOpen(true);
            }}
            onOpenNewOrder={() => setNewOrderOpen(true)}
            onMoveToOrder={handleMoveSavedToOrder}
            onUpdateSavedItem={handleUpdateSavedItem}
            onDeleteSavedItem={handleDeleteSavedItem}
            onBulkAction={handleSavedItemsBulkAction}
          />
        ) : mainTab === 'conclusi' ? (
          <ConcludedOrdersView
            orders={db.orders}
            items={db.items}
            displayCurrency={displayCurrency}
            onExportCsv={triggerCsvDownload}
            onOpenReceiptPrinter={(orderId) => setPrinterOrderId(orderId)}
            onReopenOrder={handleReopenOrder}
            onSelectOrder={(orderId) => {
              setSelectedOrderId(orderId);
              setMainTab('ordini');
            }}
          />
        ) : mainTab === 'armadio' ? (
          <WardrobeView
            orders={db.orders}
            items={db.items}
            displayCurrency={displayCurrency}
            estimatedExchangeRate={estimatedExchangeRate}
            onSelectOrder={(orderId) => {
              setSelectedOrderId(orderId);
              setMainTab('ordini');
            }}
            onUpdateItemImages={handleUpdateItemImages}
            onUpdateWardrobeItem={handleUpdateWardrobeItem}
          />
        ) : mainTab === 'vendor' ? (
          <VendorsView
            orders={db.orders}
            items={db.items}
            displayCurrency={displayCurrency}
            estimatedExchangeRate={estimatedExchangeRate}
            onSelectOrder={(orderId) => {
              setSelectedOrderId(orderId);
              setMainTab('ordini');
            }}
          />
        ) : mainTab === 'statistiche' ? (
          <AnalyticsView
            orders={db.orders}
            items={db.items}
            displayCurrency={displayCurrency}
            estimatedExchangeRate={estimatedExchangeRate}
            onUpdateEstimatedExchangeRate={handleUpdateGlobalExchangeRate}
            onChangeDisplayCurrency={setDisplayCurrency}
          />
        ) : mainTab === 'spedizione' ? (
          <ShippingCalculatorView
            orders={db.orders}
            items={db.items}
            initialOrderId={activeOrder?.id ?? null}
            displayCurrency={displayCurrency}
            estimatedExchangeRate={estimatedExchangeRate}
            onUpdateTracking={handleUpdateTracking}
            onSyncLiveTracking={handleSyncLiveTracking}
          />
        ) : isDesktop ? (
          <div
            className={
              activeOrder
                ? 'grid grid-cols-[270px_minmax(0,1fr)_310px] gap-6 items-start'
                : 'grid grid-cols-[270px_minmax(0,1fr)] gap-6 items-start'
            }
          >
            {/* Left Sidebar: Manual Orders List + Desktop Swap Currency Card */}
            <aside className="space-y-4">
              <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h1 className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0]">
                    Your Orders
                  </h1>
                  <span className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                    {db.orders.length}
                  </span>
                </div>

                {/* Segmented Order Status Filter */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#EFEFEA] dark:bg-[#242422] rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleSelectOrderFilter('all')}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                      orderFilter === 'all'
                        ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                        : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectOrderFilter('open')}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                      orderFilter === 'open'
                        ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                        : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectOrderFilter('concluded')}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                      orderFilter === 'concluded'
                        ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                        : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                    }`}
                  >
                    Concluded
                  </button>
                </div>

                {/* Order Selection List */}
                <div className="space-y-1.5" data-testid="orders-sidebar-list">
                  {filteredOrders.length === 0 ? (
                    <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] py-4 text-center">
                      No orders in this view.
                    </p>
                  ) : (
                    filteredOrders.map((ord) => {
                      const ordItems = db.items.filter((i) => i.orderId === ord.id);
                      const totals = calculateOrderTotals(ordItems, ord.exchangeRate);
                      const isSelected = activeOrder?.id === ord.id;
                      const isOpen = ord.status === 'open';

                      return (
                        <div
                          key={ord.id}
                          className={`group relative rounded-xl border transition-colors ${
                            isSelected
                              ? 'border-[#111110] dark:border-[#F4F4F0] bg-[#F7F7F5] dark:bg-[#242422]'
                              : 'border-transparent hover:bg-[#F7F7F5] dark:hover:bg-[#222220]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrderId(ord.id);
                              setActiveCategory('All');
                            }}
                            className="w-full text-left p-3 pr-9 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] rounded-xl"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0] truncate">
                                {ord.title}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 mt-1.5 text-xs">
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  isOpen
                                    ? 'text-[#16A34A]'
                                    : 'text-[#6E6E68] dark:text-[#9A9A92]'
                                }`}
                              >
                                {isOpen ? (
                                  <Clock className="w-3 h-3" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                {isOpen ? 'Active' : 'Concluded'}
                              </span>

                              <span className="font-mono text-[#111110] dark:text-[#F4F4F0] tabular-nums">
                                {formatCny(totals.totalCny)}
                              </span>
                            </div>

                            <p className="text-[11px] text-[#8E8E87] dark:text-[#7E7E77] mt-1 tabular-nums">
                              {totals.itemCount}{' '}
                              {totals.itemCount === 1 ? 'item' : 'items'} ·{' '}
                              {formatShortDate(ord.createdAt)}
                            </p>
                          </button>

                          {pendingDeleteOrderId === ord.id ? (
                            <div className="absolute right-2 top-2 z-10">
                              <TimedUndoAction
                                compact
                                autoStart
                                undoDuration={10}
                                cancelText="Cancel"
                                deleteText="Delete"
                                onCancel={() => setPendingDeleteOrderId(null)}
                                onExpire={() => {
                                  setPendingDeleteOrderId(null);
                                  void handleDeleteOrder(ord.id);
                                }}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPendingDeleteOrderId(ord.id)}
                              aria-label={`Delete order ${ord.title}`}
                              className="absolute right-2 top-2.5 p-1.5 rounded-lg text-[#8E8E87] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[#DC2626] hover:bg-[#FEF2F2] dark:hover:bg-[#3A161A] transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Desktop Left Column: Dynamic Currency Swap */}
              <SwapCurrencyCard
                estimatedExchangeRate={estimatedExchangeRate}
                onUpdateEstimatedExchangeRate={handleUpdateGlobalExchangeRate}
                defaultAmount="100"
                defaultFromCode="CNY"
                toCode={displayCurrency}
                onToCodeChange={setDisplayCurrency}
              />
            </aside>

            {/* Center: Active Order Detail, Product Catalog & Shipment Tracking */}
            <section className="min-w-0 space-y-6">
              {activeOrder ? (
                <OrderDetailView
                  order={activeOrder}
                  items={activeOrderItems}
                  openOrders={openOrders}
                  existingVendors={existingVendors}
                  activeCategory={activeCategory}
                  displayCurrency={displayCurrency}
                  onCategoryChange={setActiveCategory}
                  onOpenAddProduct={() => {
                    setAddProductMode('order');
                    setAddProductOpen(true);
                  }}
                  onDeleteItem={handleDeleteItem}
                  onSaveItemForLater={handleSaveItemForLater}
                  onUpdateItem={handleUpdateItem}
                  onBulkAction={handleOrderItemsBulkAction}
                  onUpdateTracking={handleUpdateTracking}
                  onSyncLiveTracking={handleSyncLiveTracking}
                  onBack={() => setSelectedOrderId(null)}
                />
              ) : (
                <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-12 text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#EFEFEA] dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0]">
                    <Package className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-[#111110] dark:text-[#F4F4F0]">
                      {db.orders.length === 0 ? 'No orders yet' : 'No order selected'}
                    </h2>
                    <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] max-w-sm mx-auto">
                      {db.orders.length === 0
                        ? 'Create a new Superbuy order manually to start cataloging items from Yupoo and Taobao.'
                        : 'Select an order from the left sidebar to inspect its details, or create a new one.'}
                    </p>
                  </div>
                  <TactileButton
                    variant="primary"
                    onClick={() => setNewOrderOpen(true)}
                  >
                    <Plus className="w-4 h-4" />
                    Create New Order
                  </TactileButton>
                </div>
              )}
            </section>

            {/* Right Column: Thermal Receipt Summary & Animated Category Chart */}
            {activeOrder && activeOrderMetrics && (
              <aside className="space-y-5">
                <OrderReceipt
                  order={activeOrder}
                  items={activeOrderItems}
                  displayCurrency={displayCurrency}
                  onConcludeOrder={handleConcludeOrder}
                  onReopenOrder={handleReopenOrder}
                  onUpdateExchangeRate={handleUpdateOrderExchangeRate}
                  onOpenShippingEstimator={() => setMainTab('spedizione')}
                  onOpenReceiptPrinter={() => setPrinterOrderId(activeOrder.id)}
                />

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-[#111110] dark:text-[#F4F4F0]">
                      Spending by Category
                    </h3>
                    <span className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                      {formatCurrency(
                        displayCurrency === 'CNY'
                          ? activeOrderMetrics.totalCny
                          : convertEurToCurrency(activeOrderMetrics.totalEur, displayCurrency),
                        displayCurrency
                      )}
                    </span>
                  </div>
                  <CategorySpendChart
                    breakdown={activeOrderMetrics.byCategory}
                    activeCategory={activeCategory}
                    displayCurrency={displayCurrency}
                    onSelectCategory={setActiveCategory}
                  />
                </motion.div>
              </aside>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {!activeOrder ? (
              <aside className="space-y-4">
                <div className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h1 className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0]">
                      Your Orders
                    </h1>
                    <span className="text-xs font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                      {db.orders.length}
                    </span>
                  </div>

                  {/* Segmented Order Status Filter */}
                  <div className="grid grid-cols-3 gap-1 p-1 bg-[#EFEFEA] dark:bg-[#242422] rounded-xl">
                    <button
                      type="button"
                      onClick={() => setOrderFilter('all')}
                      className={`py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                        orderFilter === 'all'
                          ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                          : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderFilter('open')}
                      className={`py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                        orderFilter === 'open'
                          ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                          : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderFilter('concluded')}
                      className={`py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                        orderFilter === 'concluded'
                          ? 'bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] shadow-xs'
                          : 'text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                      }`}
                    >
                      Concluded
                    </button>
                  </div>

                  {/* Order Selection List */}
                  <div className="space-y-1.5" data-testid="orders-sidebar-list">
                    {filteredOrders.length === 0 ? (
                      <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] py-4 text-center">
                        No orders in this view.
                      </p>
                    ) : (
                      filteredOrders.map((ord) => {
                        const ordItems = db.items.filter((i) => i.orderId === ord.id);
                        const totals = calculateOrderTotals(ordItems, ord.exchangeRate);
                        const isSelected = selectedOrderId === ord.id;
                        const isOpen = ord.status === 'open';

                        return (
                          <div
                            key={ord.id}
                            className={`group relative rounded-xl border transition-colors ${
                              isSelected
                                ? 'border-[#111110] dark:border-[#F4F4F0] bg-[#F7F7F5] dark:bg-[#242422]'
                                : 'border-transparent hover:bg-[#F7F7F5] dark:hover:bg-[#222220]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderId(ord.id);
                                setActiveCategory('All');
                              }}
                              className="w-full text-left p-3 pr-9 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] rounded-xl"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0] truncate">
                                  {ord.title}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-2 mt-1.5 text-xs">
                                <span
                                  className={`inline-flex items-center gap-1 ${
                                    isOpen
                                      ? 'text-[#16A34A]'
                                      : 'text-[#6E6E68] dark:text-[#9A9A92]'
                                  }`}
                                >
                                  {isOpen ? (
                                    <Clock className="w-3 h-3" />
                                  ) : (
                                    <CheckCircle2 className="w-3 h-3" />
                                  )}
                                  {isOpen ? 'Active' : 'Concluded'}
                                </span>

                                <span className="font-mono text-[#111110] dark:text-[#F4F4F0] tabular-nums">
                                  {formatCny(totals.totalCny)}
                                </span>
                              </div>

                              <p className="text-[11px] text-[#8E8E87] dark:text-[#7E7E77] mt-1 tabular-nums">
                                {totals.itemCount}{' '}
                                {totals.itemCount === 1 ? 'item' : 'items'} ·{' '}
                                {formatShortDate(ord.createdAt)}
                              </p>
                            </button>

                            {pendingDeleteOrderId === ord.id ? (
                              <div className="absolute right-2 top-2 z-10">
                                <TimedUndoAction
                                  compact
                                  autoStart
                                  undoDuration={10}
                                  cancelText="Cancel"
                                  deleteText="Delete"
                                  onCancel={() => setPendingDeleteOrderId(null)}
                                  onExpire={() => {
                                    setPendingDeleteOrderId(null);
                                    void handleDeleteOrder(ord.id);
                                  }}
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPendingDeleteOrderId(ord.id)}
                                aria-label={`Delete order ${ord.title}`}
                                className="absolute right-2 top-2.5 p-1.5 rounded-lg text-[#8E8E87] opacity-75 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 hover:text-[#DC2626] hover:bg-[#FEF2F2] dark:hover:bg-[#3A161A] transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </aside>
            ) : (
              <div className="space-y-5">
                <OrderDetailView
                  order={activeOrder}
                  items={activeOrderItems}
                  openOrders={openOrders}
                  existingVendors={existingVendors}
                  activeCategory={activeCategory}
                  displayCurrency={displayCurrency}
                  hideTracking
                  onCategoryChange={setActiveCategory}
                  onOpenAddProduct={() => {
                    setAddProductMode('order');
                    setAddProductOpen(true);
                  }}
                  onDeleteItem={handleDeleteItem}
                  onSaveItemForLater={handleSaveItemForLater}
                  onUpdateItem={handleUpdateItem}
                  onBulkAction={handleOrderItemsBulkAction}
                  onUpdateTracking={handleUpdateTracking}
                  onSyncLiveTracking={handleSyncLiveTracking}
                  onBack={() => setSelectedOrderId(null)}
                />

                <OrderReceipt
                  order={activeOrder}
                  items={activeOrderItems}
                  displayCurrency={displayCurrency}
                  onConcludeOrder={handleConcludeOrder}
                  onReopenOrder={handleReopenOrder}
                  onUpdateExchangeRate={handleUpdateOrderExchangeRate}
                  onOpenShippingEstimator={() => setMainTab('spedizione')}
                  onOpenReceiptPrinter={() => setPrinterOrderId(activeOrder.id)}
                />

                <OrderTrackingPanel
                  order={activeOrder}
                  onUpdateTracking={handleUpdateTracking}
                  onSyncLiveTracking={handleSyncLiveTracking}
                  compact
                />

                {activeOrderMetrics && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-5"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold text-[#111110] dark:text-[#F4F4F0]">
                        Spending by Category
                      </h3>
                      <span className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92] tabular-nums">
                        {formatCurrency(
                          displayCurrency === 'CNY'
                            ? activeOrderMetrics.totalCny
                            : convertEurToCurrency(activeOrderMetrics.totalEur, displayCurrency),
                          displayCurrency
                        )}
                      </span>
                    </div>
                    <CategorySpendChart
                      breakdown={activeOrderMetrics.byCategory}
                      activeCategory={activeCategory}
                      displayCurrency={displayCurrency}
                      onSelectCategory={setActiveCategory}
                    />
                  </motion.div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <NewOrderModal
        open={newOrderOpen}
        estimatedExchangeRate={estimatedExchangeRate}
        onClose={() => setNewOrderOpen(false)}
        onCreateOrder={handleCreateOrder}
      />

      <AddProductModal
        open={addProductOpen}
        order={activeOrder}
        mode={addProductMode}
        existingVendors={existingVendors}
        displayCurrency={displayCurrency}
        estimatedExchangeRate={estimatedExchangeRate}
        onClose={() => setAddProductOpen(false)}
        onAddProduct={handleAddProduct}
        onSaveForLater={handleAddSavedProduct}
      />

      <ReceiptPrinterModal
        open={Boolean(printerOrder)}
        order={printerOrder}
        items={printerOrderItems}
        displayCurrency={displayCurrency}
        onClose={() => setPrinterOrderId(null)}
      />

      <BackupModal
        open={backupOpen}
        orders={db.orders}
        items={db.items}
        savedItems={db.savedItems ?? []}
        trashOrders={db.trashOrders}
        trashItems={db.trashItems}
        onClose={() => setBackupOpen(false)}
        onImportSuccess={(newState) => {
          setDb(newState);
          setActiveCategory('All');
          setSelectedOrderId((prev) => {
            if (prev && newState.orders.some((o) => o.id === prev)) return prev;
            const firstOpen = newState.orders.find((o) => o.status === 'open');
            return firstOpen?.id ?? newState.orders[0]?.id ?? null;
          });
        }}
      />
    </div>
  );
}
