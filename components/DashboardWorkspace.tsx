import React, { useMemo, useState } from 'react';
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
    const [hoveredPreviewTemplate, setHoveredPreviewTemplate] = useState<AdTemplate | null>(null);
    const hoverPreviewAssets = useMemo<AdAsset[]>(() => {
        const previewVideoUrl = hoveredPreviewTemplate?.preview_video_path || (hoveredPreviewTemplate?.id === 'mt-s-1' ? '/template-previews/bubble-fullscreen.mp4' : '');
        if (!hoveredPreviewTemplate || !previewVideoUrl) return [];
        return [{
            id: `template-preview-${hoveredPreviewTemplate.id}`,
            url: previewVideoUrl,
            name: `${hoveredPreviewTemplate.name}展示视频.mp4`,
            size: 'template-preview',
            isCompressed: false,
            type: 'video/mp4',
            category: hoveredPreviewTemplate.category,
            app: hoveredPreviewTemplate.app,
            templateName: hoveredPreviewTemplate.name,
            dimensions: hoveredPreviewTemplate.dimensions || '1440 x 2340',
            maskUrl: hoveredPreviewTemplate.mask_path || null,
            showMask: false,
        }];
    }, [hoveredPreviewTemplate]);
    const previewAssets = hoverPreviewAssets.length > 0 ? hoverPreviewAssets : processedAssets;

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
        const isCrossTemplateAdaptation = raw.file.type.startsWith('image/') && rawFiles.length === 1 && activeTemplates.length > 1;
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
        if (isCrossTemplateAdaptation) {
            return {
                tone: 'warn',
                label: '需 AI 跨模板适配',
                detail: matches.length
                    ? `当前图片可匹配${describeMatches(matches)}，但一张图片要适配 ${activeTemplates.length} 个模板\nAI 将用于跨模板扩图、裁切、构图调整和安全区避让`
                    : `当前 ${sizeText}，需适配 ${activeTemplates.length} 个模板\nAI 将用于扩图、裁切、背景补全、主体位置调整和智能排版`
            };
        }
        if (matches.length) {
            return {
                tone: 'ok',
                label: activeTemplates.length === 1 ? '尺寸符合，无需 AI' : '图片尺寸符合',
                detail: activeTemplates.length === 1
                    ? `图片尺寸符合当前模板\n${sizeText}\n将直接执行模板套用、遮罩叠加、安全区校验和导出`
                    : `图片尺寸符合${describeMatches(matches)}尺寸\n${sizeText}`
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
                            onTemplatePreviewHover={setHoveredPreviewTemplate}
                        />
                    </div>
                </aside>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col gap-2">
                    {/* Drag-and-drop / Upload Section */}
                    <section
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`relative px-6 pt-3 pb-3 shrink-0 transition-all duration-400 ease-in-out origin-top ${isCollapsed ? 'opacity-20 scale-[0.95] max-h-[96px] overflow-hidden' : 'opacity-100 max-h-[160px] overflow-y-auto custom-scrollbar'}`}
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
                                className="group relative flex items-center justify-center gap-4 min-h-[96px] border-2 border-dashed border-white/20 bg-white/10 hover:bg-white/20 rounded-[24px] px-6 py-4 transition-all cursor-pointer shadow-inner liquid-glass"
                            >
                                <div className="h-11 w-11 liquid-glass flex items-center justify-center text-primary group-hover:scale-110 transition-transform shrink-0">
                                    <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-base font-bold text-slate-900 shadow-sm">{t('main.startCreation')}</h3>
                                    <p className="text-slate-500 text-xs mt-0.5 font-semibold">{t('main.uploadHint')}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-4 px-1">
                                    <div className="min-w-0">
                                        <h3 className="text-sm leading-tight font-black text-slate-800">{t('main.pendingAssets')} ({rawFiles.length})</h3>
                                        <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                                            AI 不默认开启；尺寸符合当前模板时直接套模板，不符合或需跨模板适配时才提示使用 AI。
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="h-9 px-4 text-xs font-black text-primary bg-white/85 rounded-[14px] shadow-ios hover:bg-white transition-all active:scale-95"
                                        >
                                            {t('main.addMore')}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setRawFiles([]);
                                                setProcessedAssets([]);
                                            }}
                                            className="h-9 px-4 text-xs font-black text-red-500 bg-white/85 rounded-[14px] shadow-ios hover:bg-red-50 transition-all active:scale-95"
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
                                            <div key={raw.id} className="group flex items-center gap-3 rounded-[20px] bg-white/60 border border-white/60 px-4 py-3 min-h-[84px] shadow-ios lens-effect">
                                                <div className="relative w-16 h-16 rounded-[14px] bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                                                    {raw.file.type.startsWith('video/') ? (
                                                        <>
                                                            {raw.thumbnailUrl ? (
                                                                <img src={raw.thumbnailUrl} className="w-full h-full object-cover opacity-70" alt="thumb" />
                                                            ) : (
                                                                <span className="material-symbols-outlined text-slate-400 text-2xl">play_circle</span>
                                                            )}
                                                            <span className="absolute material-symbols-outlined text-white text-[30px] drop-shadow">play_circle</span>
                                                        </>
                                                    ) : (
                                                        <img src={raw.previewUrl} className="w-full h-full object-contain" alt="raw" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm text-slate-800 truncate font-black">{raw.file.name}</p>
                                                    <p className="text-xs text-slate-400 font-black mt-0.5">{Math.round(raw.file.size / 1024)} KB</p>
                                                </div>
                                                {!isCollapsed && (
                                                    <div className="hidden lg:block min-w-[320px] max-w-[520px]">
                                                        <div className={`rounded-[16px] border px-4 py-2 ${statusClass}`}>
                                                            <p className="text-xs font-black leading-snug whitespace-pre-line line-clamp-2">{status.detail}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => removeRawFile(raw.id)}
                                                    className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-70 group-hover:opacity-100 shrink-0"
                                                >
                                                    <span className="material-symbols-outlined text-[22px]">close</span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Sticky Controller Header */}
                    <div className="px-6 pt-1 pb-3 sticky top-[76px] z-30 pointer-events-none transition-all duration-300">
                        <div className="flex items-center justify-between px-6 py-4 liquid-glass border border-white/30 shadow-sm pointer-events-auto">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 liquid-glass flex items-center justify-center text-primary shadow-inner">
                                        <span className="material-symbols-outlined text-[24px]">grid_view</span>
                                    </div>
                                    <h2 className="text-base font-bold text-slate-800">生成预览</h2>
                                </div>
                                {hoverPreviewAssets.length > 0 && !isProcessing && (
                                    <span className="text-xs font-bold text-blue-600 bg-blue-500/10 backdrop-blur-md border border-blue-500/20 px-3 py-1 rounded-full">
                                        模版效果预览
                                    </span>
                                )}
                                {processedAssets.length > 0 && hoverPreviewAssets.length === 0 && !isProcessing && (
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

                                {processedAssets.length > 0 && hoverPreviewAssets.length === 0 && (
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
                            assets={previewAssets}
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
