import { useState, useRef, useId } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Download,
  Upload,
  HardDrive,
  Camera,
  Package,
  Layers,
  AlertTriangle,
  CheckCircle2,
  FileJson,
  FileSpreadsheet,
  RotateCcw,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  getCategoryLabel,
  PRODUCT_CATEGORIES,
  type HaulDatabaseState,
  type HaulOrder,
  type ProductItem,
} from '../types/haul';
import {
  createHaulBackup,
  generateHaulCsv,
  validateHaulBackup,
  formatShortDate,
  formatCny,
  type BackupValidationResult,
} from '../utils/haulLogic';
import { TactileButton } from './TactileButtons';

interface BackupModalProps {
  open: boolean;
  orders: HaulOrder[];
  items: ProductItem[];
  savedItems?: ProductItem[];
  trashOrders?: HaulOrder[];
  trashItems?: ProductItem[];
  onClose: () => void;
  onImportSuccess: (newState: HaulDatabaseState) => void;
}

type BackupTab = 'export' | 'import' | 'trash';

export function BackupModal({
  open,
  orders,
  items,
  savedItems = [],
  trashOrders = [],
  trashItems = [],
  onClose,
  onImportSuccess,
}: BackupModalProps) {
  const [activeTab, setActiveTab] = useState<BackupTab>('export');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<BackupValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalId = useId();

  // Current stats for export preview
  const currentBackup = createHaulBackup(orders, items, savedItems);
  const totalPhotos = currentBackup.stats.totalPhotos;

  const handleExportDownload = () => {
    const jsonString = JSON.stringify(currentBackup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const now = new Date().toISOString().slice(0, 10);
    const filename = `hauldesk-full-backup-${now}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportCsvDownload = (onlyConcluded = false) => {
    const subset = onlyConcluded
      ? orders.filter((o) => o.status === 'concluded')
      : orders;
    const csvContent = generateHaulCsv(subset, items);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const now = new Date().toISOString().slice(0, 10);
    const filename = onlyConcluded
      ? `hauldesk-concluded-orders-${now}.csv`
      : `hauldesk-all-orders-${now}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const processFile = async (file: File) => {
    setImportFile(file);
    setImportError(null);
    setImportSuccess(false);

    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setValidation({
          valid: false,
          error: 'The selected file is not valid JSON or appears corrupted.',
        });
        return;
      }

      const res = validateHaulBackup(parsed);
      setValidation(res);
    } catch (err) {
      setValidation({
        valid: false,
        error: err instanceof Error ? err.message : 'Error reading the selected file.',
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleExecuteImport = async () => {
    if (!validation?.valid || !validation.state) return;

    setImporting(true);
    setImportError(null);

    try {
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.state),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        state?: HaulDatabaseState;
        error?: string;
      };

      if (!res.ok || !data.state) {
        throw new Error(data.error || 'Error restoring database.');
      }

      onImportSuccess(data.state);
      setImportSuccess(true);
      window.setTimeout(() => {
        onClose();
        setImportSuccess(false);
        setImportFile(null);
        setValidation(null);
      }, 1400);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to complete restore.');
    } finally {
      setImporting(false);
    }
  };

  const resetImportState = () => {
    setImportFile(null);
    setValidation(null);
    setImportError(null);
    setImportSuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal Window */}
        <motion.div
          key={`backup-modal-${modalId}`}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-2xl bg-[#F7F7F5] dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-[#E5E5E0] dark:border-[#2C2C2A] bg-white dark:bg-[#121211] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#EFEFEA] dark:bg-[#242422] flex items-center justify-center text-[#111110] dark:text-[#F4F4F0]">
                <HardDrive className="w-5 h-5 text-neutral-800 dark:text-neutral-200" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#111110] dark:text-[#F4F4F0]">
                  HaulDesk Backup &amp; Restore
                </h2>
                <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                  Full archival of all orders, items, and high-resolution photos
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Backup and Restore"
              className="p-2 rounded-xl text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] hover:bg-[#EFEFEA] dark:hover:bg-[#242422] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Segmented Tab Bar */}
          {(() => {
            const totalTrashCount = trashOrders.length + trashItems.length;
            return (
              <div className="px-5 sm:px-6 pt-4 pb-2 border-b border-[#E5E5E0] dark:border-[#2C2C2A] bg-white/50 dark:bg-[#141413]/50 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('export');
                    setImportError(null);
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'export'
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                      : 'bg-[#EFEFEA] dark:bg-[#242422] text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                  }`}
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span className="truncate">Export</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('import');
                    setImportError(null);
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'import'
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                      : 'bg-[#EFEFEA] dark:bg-[#242422] text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                  }`}
                >
                  <Upload className="w-4 h-4 shrink-0" />
                  <span className="truncate">Restore</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('trash');
                    setImportError(null);
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'trash'
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                      : 'bg-[#EFEFEA] dark:bg-[#242422] text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]'
                  }`}
                >
                  <Trash2 className="w-4 h-4 shrink-0 text-[#E11D48]" />
                  <span className="truncate">Trash ({totalTrashCount})</span>
                </button>
              </div>
            );
          })()}

          {/* Body Content */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
            {activeTab === 'trash' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0]">
                      Trash · Deleted Orders &amp; Items
                    </h3>
                    <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                      Restore accidentally deleted items or permanently remove them.
                    </p>
                  </div>
                  {(trashOrders.length > 0 || trashItems.length > 0) && (
                    <TactileButton
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const res = await fetch('/api/trash/empty', { method: 'POST' });
                        const data = await res.json();
                        if (res.ok && data.state) {
                          onImportSuccess(data.state);
                        }
                      }}
                      className="text-[#DC2626] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Empty Trash
                    </TactileButton>
                  )}
                </div>

                {trashOrders.length === 0 && trashItems.length === 0 ? (
                  <div className="py-12 text-center space-y-2 bg-white dark:bg-[#141413] rounded-2xl border border-[#E5E5E0] dark:border-[#2C2C2A]">
                    <Trash2 className="w-8 h-8 text-[#8E8E87] mx-auto mb-2" />
                    <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0]">
                      Trash is empty
                    </p>
                    <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92] max-w-xs mx-auto">
                      Deleted orders and items appear here and can be restored at any time.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                    {trashOrders.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-[#6E6E68] dark:text-[#9A9A92] uppercase tracking-wider">
                          Deleted Orders ({trashOrders.length})
                        </h4>
                        {trashOrders.map((ord) => (
                          <div
                            key={ord.id}
                            className="bg-white dark:bg-[#141413] p-3.5 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0] truncate">
                                {ord.title}
                              </p>
                              <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                                Created {formatShortDate(ord.createdAt)} · {ord.status === 'open' ? 'Open' : 'Concluded'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <TactileButton
                                variant="secondary"
                                size="sm"
                                onClick={async () => {
                                  const res = await fetch(`/api/trash/orders/${ord.id}/restore`, { method: 'POST' });
                                  const data = await res.json();
                                  if (res.ok && data.state) {
                                    onImportSuccess(data.state);
                                  }
                                }}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Restore
                              </TactileButton>
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await fetch(`/api/trash/orders/${ord.id}`, { method: 'DELETE' });
                                  const data = await res.json();
                                  if (res.ok && data.state) {
                                    onImportSuccess(data.state);
                                  }
                                }}
                                aria-label={`Permanently delete ${ord.title}`}
                                className="p-2 rounded-lg text-[#8E8E87] hover:text-[#DC2626] hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {trashItems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-[#6E6E68] dark:text-[#9A9A92] uppercase tracking-wider">
                          Deleted Items ({trashItems.length})
                        </h4>
                        {trashItems.map((item) => (
                          <div
                            key={item.id}
                            className="bg-white dark:bg-[#141413] p-3.5 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0 border border-[#E5E5E0] dark:border-[#2C2C2A]">
                                {item.imageUrl ? (
                                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <Package className="w-5 h-5 m-auto text-neutral-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#111110] dark:text-[#F4F4F0] truncate">
                                  {item.title}
                                </p>
                                <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                                  {getCategoryLabel(item.category)} · {item.vendor} · <span className="font-mono">{formatCny(item.priceCny)}</span>
                                  {item.orderId === 'saved' ? ' · From Save for Later' : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <TactileButton
                                variant="secondary"
                                size="sm"
                                onClick={async () => {
                                  const res = await fetch(`/api/trash/items/${item.id}/restore`, { method: 'POST' });
                                  const data = await res.json();
                                  if (res.ok && data.state) {
                                    onImportSuccess(data.state);
                                  }
                                }}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Restore
                              </TactileButton>
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await fetch(`/api/trash/items/${item.id}`, { method: 'DELETE' });
                                  const data = await res.json();
                                  if (res.ok && data.state) {
                                    onImportSuccess(data.state);
                                  }
                                }}
                                aria-label={`Permanently delete ${item.title}`}
                                className="p-2 rounded-lg text-[#8E8E87] hover:text-[#DC2626] hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : activeTab === 'export' ? (
              <div className="space-y-5">
                {/* Statistics Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white dark:bg-[#141413] p-4 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] text-center">
                    <div className="flex justify-center mb-1 text-blue-600 dark:text-blue-400">
                      <Package className="w-5 h-5" />
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#111110] dark:text-[#F4F4F0] tabular-nums">
                      {orders.length}
                    </div>
                    <div className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] font-medium">
                      Orders ({currentBackup.stats.openOrders} open, {currentBackup.stats.concludedOrders} concluded)
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#141413] p-4 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] text-center">
                    <div className="flex justify-center mb-1 text-emerald-600 dark:text-emerald-400">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#111110] dark:text-[#F4F4F0] tabular-nums">
                      {items.length}
                    </div>
                    <div className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] font-medium">
                      Cataloged Items{savedItems.length > 0 ? ` (+${savedItems.length} saved)` : ''}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#141413] p-4 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] text-center">
                    <div className="flex justify-center mb-1 text-purple-600 dark:text-purple-400">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#111110] dark:text-[#F4F4F0] tabular-nums">
                      {totalPhotos}
                    </div>
                    <div className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] font-medium">
                      Saved Photos
                    </div>
                  </div>
                </div>

                {/* 10 Supported Categories Notice & Breakdown */}
                <div className="bg-white dark:bg-[#141413] p-3.5 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#111110] dark:text-[#F4F4F0] flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-[#E11D48]" />
                      10 Supported Categories Included in Backup
                    </span>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      10/10 Valid
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRODUCT_CATEGORIES.map((cat) => {
                      const count = currentBackup.stats.byCategory?.[cat.id] ?? 0;
                      return (
                        <span
                          key={cat.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#F7F7F5] dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0] border border-[#E5E5E0] dark:border-[#343430]"
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                          <span>{cat.label}</span>
                          <span className="text-[#6E6E68] dark:text-[#9A9A92] font-mono tabular-nums text-[10px]">
                            ({count})
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Export Format Choice: JSON Backup vs CSV Spreadsheet */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-[#141413] p-4 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#EFEFEA] dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0]">
                          <FileJson className="w-4 h-4" />
                        </span>
                        <div>
                          <h3 className="text-xs font-bold text-[#111110] dark:text-[#F4F4F0]">
                            Full Backup (.json)
                          </h3>
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            1:1 with all {totalPhotos} photos
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-[#52524E] dark:text-[#A0A096] leading-relaxed">
                        Saves orders, tracking history, sizes, links, and all QC/wardrobe photos for an exact restore.
                      </p>
                    </div>
                    <TactileButton
                      variant="dark"
                      size="md"
                      onClick={handleExportDownload}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download JSON Backup</span>
                    </TactileButton>
                  </div>

                  <div className="bg-white dark:bg-[#141413] p-4 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#EFEFEA] dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0]">
                          <FileSpreadsheet className="w-4 h-4" />
                        </span>
                        <div>
                          <h3 className="text-xs font-bold text-[#111110] dark:text-[#F4F4F0]">
                            Orders Spreadsheet (.csv)
                          </h3>
                          <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
                            Excel / Google Sheets compatible
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-[#52524E] dark:text-[#A0A096] leading-relaxed">
                        Exports a tabular sheet of items, CNY/EUR prices, vendors, tracking numbers, and product links.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <TactileButton
                        variant="secondary"
                        size="md"
                        onClick={() => handleExportCsvDownload(false)}
                        className="w-full flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download All CSV</span>
                      </TactileButton>
                      {currentBackup.stats.concludedOrders > 0 && (
                        <button
                          type="button"
                          onClick={() => handleExportCsvDownload(true)}
                          className="w-full text-[11px] font-medium text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] underline underline-offset-2 cursor-pointer"
                        >
                          Concluded orders only (.csv)
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Language Notice */}
                <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] bg-white dark:bg-[#141413] px-3.5 py-2.5 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A]">
                  Language: English is currently the default application language. Additional language support is planned for future releases.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* File Upload Zone */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  aria-label="Select JSON backup file"
                  onChange={handleFileChange}
                  className="sr-only"
                  tabIndex={-1}
                />

                {!importFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const dropped = e.dataTransfer.files?.[0];
                      if (dropped) {
                        void processFile(dropped);
                      }
                    }}
                    className="border-2 border-dashed border-[#D4D4CE] dark:border-[#383835] hover:border-neutral-700 dark:hover:border-neutral-300 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-white/40 dark:bg-[#141413]/40 flex flex-col items-center justify-center space-y-3"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#EFEFEA] dark:bg-[#242422] flex items-center justify-center text-[#52524E] dark:text-[#A0A096]">
                      <FileJson className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0]">
                        Select or drop a backup file (.json)
                      </div>
                      <p className="text-xs text-[#6E6E68] dark:text-[#9A9A92]">
                        Supports full HaulDesk backups including all photos
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#EFEFEA] dark:bg-[#242422] text-xs font-semibold text-[#111110] dark:text-[#F4F4F0]">
                      <Upload className="w-3.5 h-3.5" />
                      Browse files
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* File preview header */}
                    <div className="bg-white dark:bg-[#141413] p-4 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                          <FileJson className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[#111110] dark:text-[#F4F4F0] truncate max-w-[260px] sm:max-w-md">
                            {importFile.name}
                          </div>
                          <div className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] font-mono">
                            {(importFile.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={resetImportState}
                        className="text-xs font-medium text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] underline cursor-pointer"
                      >
                        Change file
                      </button>
                    </div>

                    {/* Validation State */}
                    {validation?.valid && validation.stats ? (
                      <div className="space-y-4">
                        {/* Inspection results */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-white dark:bg-[#141413] p-3 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] text-center">
                            <div className="text-lg font-bold font-mono text-[#111110] dark:text-[#F4F4F0]">
                              {validation.stats.totalOrders}
                            </div>
                            <div className="text-[10px] text-[#6E6E68] dark:text-[#9A9A92]">
                              Orders found
                            </div>
                          </div>

                          <div className="bg-white dark:bg-[#141413] p-3 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] text-center">
                            <div className="text-lg font-bold font-mono text-[#111110] dark:text-[#F4F4F0]">
                              {validation.stats.totalItems}
                            </div>
                            <div className="text-[10px] text-[#6E6E68] dark:text-[#9A9A92]">
                              Items cataloged
                              {validation.stats.savedItemsCount > 0
                                ? ` (+${validation.stats.savedItemsCount} saved)`
                                : ''}
                            </div>
                          </div>

                          <div className="bg-white dark:bg-[#141413] p-3 rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/30 dark:bg-purple-950/20 text-center">
                            <div className="text-lg font-bold font-mono text-purple-700 dark:text-purple-300">
                              {validation.stats.totalPhotos}
                            </div>
                            <div className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                              Photos verified
                            </div>
                          </div>
                        </div>

                        {/* Category breakdown from imported backup */}
                        <div className="bg-white dark:bg-[#141413] p-3.5 rounded-xl border border-[#E5E5E0] dark:border-[#2C2C2A] space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-[#111110] dark:text-[#F4F4F0] flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5 text-[#E11D48]" />
                              Normalized Categories in File
                            </span>
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              100% Compatible
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {PRODUCT_CATEGORIES.map((cat) => {
                              const count = validation.stats?.byCategory?.[cat.id] ?? 0;
                              return (
                                <span
                                  key={cat.id}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                                    count > 0
                                      ? 'bg-[#F7F7F5] dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0] border-[#E5E5E0] dark:border-[#343430]'
                                      : 'bg-transparent text-[#8E8E87] dark:text-[#6E6E68] border-transparent opacity-60'
                                  }`}
                                >
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                                  <span>{cat.label}</span>
                                  <span className="font-mono tabular-nums text-[10px]">({count})</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        {/* Overwrite Warning Notice */}
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex gap-3 items-start">
                          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
                            <div className="font-bold">Full Restore Warning</div>
                            <p className="leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                              Current application data will be replaced with the backup data. All items, orders, and photos from the file will be restored <strong>1:1 exactly as exported</strong> without altering any information.
                            </p>
                          </div>
                        </div>

                        {importSuccess && (
                          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-4 flex items-center gap-3 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>Restore completed successfully! All data and photos have been restored.</span>
                          </div>
                        )}

                        {importError && (
                          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 rounded-xl p-4 flex items-center gap-3 text-rose-800 dark:text-rose-200 text-xs font-semibold">
                            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                            <span>{importError}</span>
                          </div>
                        )}

                        {/* Import CTA Button */}
                        <div className="pt-2 flex justify-end gap-3">
                          <TactileButton
                            variant="secondary"
                            onClick={resetImportState}
                            disabled={importing}
                          >
                            Cancel
                          </TactileButton>

                          <TactileButton
                            variant="primary"
                            onClick={handleExecuteImport}
                            disabled={importing || importSuccess}
                            className="flex items-center gap-2"
                          >
                            {importing ? (
                              <>
                                <RotateCcw className="w-4 h-4 animate-spin" />
                                <span>Restoring...</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4" />
                                <span>Restore All (1:1)</span>
                              </>
                            )}
                          </TactileButton>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 rounded-xl p-4 space-y-2 text-rose-800 dark:text-rose-200">
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                          <AlertTriangle className="w-4 h-4" />
                          Invalid file
                        </div>
                        <p className="text-xs text-rose-600 dark:text-rose-400">
                          {validation?.error || 'Could not read the selected file.'}
                        </p>
                        <div className="pt-2">
                          <TactileButton variant="secondary" size="sm" onClick={resetImportState}>
                            Choose another file
                          </TactileButton>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
