import React from 'react';
import Sidebar from './Sidebar';
import PreviewGrid from './PreviewGrid';
import Footer from './Footer';
import { AdTemplate, AdConfig, AdAsset, RawFile } from '../types';

interface DashboardWorkspaceProps {
    t: (key: string) => string;
    templates: AdTemplate[];
    config: AdConfig;
    rawFiles: RawFile[];
    processedAssets: AdAsset[];
    isProcessing: boolean;
    isDragging: boolean;
    isCollapsed: boolean;
    generationProgress: { current: number; total: number } | null;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleTemplateToggle: (id: string) => void;
    handleConfigChange: (newConfig: Partial<AdConfig>) => void;
    handleTemplateUpdate: (id: string, updates: Partial<AdTemplate>) => void;
    handleGenerate: () => void;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;
    removeRawFile: (id: string) => void;
    setRawFiles: React.Dispatch<React.SetStateAction<RawFile[]>>;
    setProcessedAssets: React.Dispatch<React.SetStateAction<AdAsset[]>>;
    handleUpdateAsset: (assetId: string, updates: Partial<AdAsset>) => void;
    handleBatchDownload: () => void;
}

const DashboardWorkspace: React.FC<DashboardWorkspaceProps> = ({
    t,
    templates,
    config,
    rawFiles,
    processedAssets,
    isProcessing,
    isDragging,
    isCollapsed,
    generationProgress,
    fileInputRef,
    handleTemplateToggle,
    handleConfigChange,
    handleTemplateUpdate,
    handleGenerate,
    handleFileUpload,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeRawFile,
    setRawFiles,
    setProcessedAssets,
    handleUpdateAsset,
    handleBatchDownload,
}) => {
    const parseDimensions = (value?: string) => {
        const match = value?.match(/(\d+)\s*x\s*(\d+)/i);
        if (!match) return null;
        return { width: Number(match[1]), height: Number(match[2]), label: `${Number(match[1])} x ${Number(match[2])}` };
    };

    const activeTemplates = templates.filter(tpl => tpl.checked);
    const dimensionSource = activeTemplates.length > 0 ? activeTemplates : templates;
    const targetSlots = dimensionSource
        .map(tpl => {
            const dimension = parseDimensions(tpl.dimensions);
            if (!dimension) return null;
            return {
                ...dimension,
                templateName: tpl.name,
                app: tpl.app,
                category: tpl.category,
                slotName: `${tpl.app}${tpl.name}`,
            };
        })
        .filter((item): item is { width: number; height: number; label: string; templateName: string; app: string; category: string; slotName: string } => Boolean(item));
    const targetDimensions = Array.from(
        new Map(targetSlots.map(item => [`${item.width}x${item.height}`, item])).values()
    );

    const describeMatches = (matches: typeof targetSlots) => {
        const uniqueNames = Array.from(new Set(matches.map(item => item.slotName)));
        if (uniqueNames.length <= 2) return uniqueNames.join('、');
        return `${uniqueNames.slice(0, 2).join('、')}等 ${uniqueNames.length} 个资源位`;
    };

    const getAssetDimensionStatus = (raw: RawFile) => {
        if (raw.file.type.startsWith('video/')) {
            if (!raw.videoDimensions) {
                return { tone: 'neutral', label: '视频素材', detail: '尺寸已放行' };
            }
            const matches = targetSlots.filter(target => target.width === raw.videoDimensions?.width && target.height === raw.videoDimensions?.height);
            const sizeText = `${raw.videoDimensions.width} x ${raw.videoDimensions.height}`;
            if (matches.length) {
                return {
                    tone: 'ok',
                    label: '视频尺寸符合',
                    detail: `视频尺寸符合${describeMatches(matches)}尺寸\n${sizeText} / ${Number.isFinite(raw.videoDimensions.duration) ? `${raw.videoDimensions.duration.toFixed(1)}s` : '时长未知'}`
                };
            }
            return {
                tone: 'warn',
                label: '建议 AI 适配',
                detail: `上传的视频不符合任意资源位尺寸（当前 ${sizeText}）\n建议使用 AI 功能协助适配`
            };
        }
        if (!raw.imageDimensions) {
            return { tone: 'neutral', label: '检测中', detail: '正在读取图片尺寸' };
        }
        if (targetDimensions.length === 0) {
            return { tone: 'neutral', label: '待选择', detail: `${raw.imageDimensions.width} x ${raw.imageDimensions.height}` };
        }
        const matches = targetSlots.filter(target => target.width === raw.imageDimensions?.width && target.height === raw.imageDimensions?.height);
        const sizeText = `${raw.imageDimensions.width} x ${raw.imageDimensions.height}`;
        if (matches.length) {
            return {
                tone: 'ok',
                label: '图片尺寸符合',
                detail: `图片尺寸符合${describeMatches(matches)}尺寸\n${sizeText}`
            };
        }
        return {
            tone: 'warn',
            label: '建议 AI 适配',
            detail: `上传的素材不符合任意资源位尺寸（当前 ${sizeText}）\n建议使用 AI 功能协助适配`
        };
    };

    return (
        <>
            <main className="flex pt-6 px-6 gap-6 transition-all duration-500">
                {/* Left Sidebar */}
                <aside className="w-[340px] sticky top-[97px] h-[calc(100vh-170px)] transition-all duration-300">
                    <div className="h-full liquid-glass rounded-[2rem] border border-white/20 shadow-xl overflow-hidden flex flex-col">
                        <Sidebar
                            templates={templates}
                            config={config}
                            onTemplateToggle={handleTemplateToggle}
                            onConfigChange={handleConfigChange}
                            activeCount={templates.filter(tpl => tpl.checked).length}
                            onGenerate={handleGenerate}
                            isProcessing={isProcessing}
                            generationProgress={generationProgress}
                            onTemplateUpdate={handleTemplateUpdate}
                        />
                    </div>
                </aside>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col gap-6">
                    {/* Drag-and-drop / Upload Section */}
                    <section
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`relative px-6 pt-6 pb-4 shrink-0 transition-all duration-400 ease-in-out origin-top ${isCollapsed ? 'opacity-20 scale-[0.95] max-h-[120px] overflow-hidden' : 'opacity-100 max-h-[260px] overflow-y-auto custom-scrollbar'}`}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            multiple
                            accept=".jpg,.jpeg,.png,.webp,.mp4"
                            onChange={handleFileUpload}
                        />

                        {/* Contextual Drag Overlay - Minimal */}
                        {isDragging && !isCollapsed && (
                            <div className="absolute inset-x-6 top-6 bottom-4 z-[60] pointer-events-none flex items-center justify-center animate-in fade-in duration-300">
                                <div className="absolute inset-0 bg-primary/5 backdrop-blur-sm rounded-[32px]"></div>
                                <div className="relative bg-white px-8 py-4 rounded-xl shadow-lg border border-slate-200">
                                    <p className="text-lg font-semibold text-slate-700">{t('main.releaseToUpload')}</p>
                                </div>
                            </div>
                        )}

                        {rawFiles.length === 0 ? (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="group relative flex flex-col items-center justify-center border-2 border-dashed border-white/20 bg-white/10 hover:bg-white/20 rounded-[32px] p-12 transition-all cursor-pointer shadow-inner liquid-glass"
                            >
                                <div className="mb-4 h-16 w-16 liquid-glass flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-4xl">cloud_upload</span>
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 shadow-sm">{t('main.startCreation')}</h3>
                                <p className="text-slate-500 text-xs mt-1 font-semibold text-center">{t('main.uploadHint')}</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between px-1">
                                    <div className="min-w-0">
                                        <h3 className="text-xs font-black text-slate-700">{t('main.pendingAssets')} ({rawFiles.length})</h3>
                                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                            图片/视频会检测是否匹配{activeTemplates.length > 0 ? '已选模板' : '全部平台'}尺寸，不匹配建议使用 AI 适配。
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="h-8 px-3 text-[11px] font-bold text-primary bg-white/70 rounded-xl shadow-ios hover:bg-white transition-all active:scale-95"
                                        >
                                            {t('main.addMore')}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setRawFiles([]);
                                                setProcessedAssets([]);
                                            }}
                                            className="h-8 px-3 text-[11px] font-bold text-red-500 bg-white/70 rounded-xl shadow-ios hover:bg-red-50 transition-all active:scale-95"
                                        >
                                            {t('main.clearAll')}
                                        </button>
                                    </div>
                                </div>
                                <div className={`space-y-2 pb-1 transition-all duration-400 ${isCollapsed ? 'opacity-60' : ''}`}>
                                    {rawFiles.map(raw => {
                                        const status = getAssetDimensionStatus(raw);
                                        const statusClass = status.tone === 'ok'
                                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                            : status.tone === 'warn'
                                                ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                : 'bg-slate-50 text-slate-500 border-slate-100';
                                        return (
                                            <div key={raw.id} className="group flex items-center gap-3 rounded-2xl bg-white/55 border border-white/50 px-3 py-2 shadow-ios lens-effect">
                                                <div className="relative w-14 h-14 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                                                    {raw.file.type.startsWith('video/') ? (
                                                        <>
                                                            {raw.thumbnailUrl ? (
                                                                <img src={raw.thumbnailUrl} className="w-full h-full object-cover opacity-70" alt="thumb" />
                                                            ) : (
                                                                <span className="material-symbols-outlined text-slate-400 text-2xl">play_circle</span>
                                                            )}
                                                            <span className="absolute material-symbols-outlined text-white text-2xl drop-shadow">play_circle</span>
                                                        </>
                                                    ) : (
                                                        <img src={raw.previewUrl} className="w-full h-full object-contain" alt="raw" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs text-slate-800 truncate font-bold">{raw.file.name}</p>
                                                    <p className="text-[10px] text-slate-400 font-black mt-0.5">{Math.round(raw.file.size / 1024)} KB</p>
                                                </div>
                                                {!isCollapsed && (
                                                    <div className="hidden md:block min-w-[260px] max-w-[360px]">
                                                        <div className={`rounded-xl border px-3 py-2 ${statusClass}`}>
                                                            <p className="text-[9px] font-semibold leading-snug whitespace-pre-line line-clamp-2">{status.detail}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => removeRawFile(raw.id)}
                                                    className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-70 group-hover:opacity-100"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Sticky Controller Header */}
                    <div className="px-6 pt-6 pb-3 sticky top-[76px] z-30 pointer-events-none transition-all duration-300">
                        <div className="flex items-center justify-between px-6 py-4 liquid-glass border border-white/30 shadow-sm pointer-events-auto">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 liquid-glass flex items-center justify-center text-primary shadow-inner">
                                        <span className="material-symbols-outlined text-[24px]">grid_view</span>
                                    </div>
                                    <h2 className="text-base font-bold text-slate-800">生成预览</h2>
                                </div>
                                {processedAssets.length > 0 && !isProcessing && (
                                    <span className="text-xs font-bold text-primary bg-primary/20 backdrop-blur-md border border-primary/30 px-3 py-1 rounded-full">
                                        {processedAssets.length} 份匹配资产
                                    </span>
                                )}
                                {isProcessing && generationProgress && (
                                    <span className="text-xs font-bold text-blue-500 bg-blue-500/10 backdrop-blur-md border border-blue-500/20 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                                        <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                                        生成中 {generationProgress.current} / {generationProgress.total}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-3 px-4 py-2 bg-white/50 rounded-xl border border-black/5">
                                    <span className="text-[11px] font-bold text-slate-500">全显遮罩</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={config.showMask}
                                            onChange={() => handleConfigChange({ showMask: !config.showMask })}
                                        />
                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary transition-all"></div>
                                    </label>
                                </div>

                                <div className="flex items-center gap-3 px-4 py-2 bg-white/50 rounded-xl border border-black/5">
                                    <span className="text-[11px] font-bold text-slate-500">全显裁剪</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={config.showCrop}
                                            onChange={() => handleConfigChange({ showCrop: !config.showCrop })}
                                        />
                                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary transition-all"></div>
                                    </label>
                                </div>

                                {processedAssets.length > 0 && (
                                    <button
                                        onClick={() => setProcessedAssets([])}
                                        className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/50 border border-black/5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                        title="清空"
                                    >
                                        <span className="material-symbols-outlined text-[22px]">delete_sweep</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Processed Previews Section */}
                    <div className="w-full pb-24 relative">
                        <PreviewGrid
                            assets={processedAssets}
                            config={config}
                            onClear={() => setProcessedAssets([])}
                            onToggleMask={() => handleConfigChange({ showMask: !config.showMask })}
                            onUpdateAsset={handleUpdateAsset}
                            isGenerating={isProcessing}
                        />
                    </div>
                </div>
            </main>

            <Footer
                selectedCount={templates.filter(tpl => tpl.checked).length}
                assetCount={processedAssets.length}
                onDownload={handleBatchDownload}
            />
        </>
    );
};

export default DashboardWorkspace;
