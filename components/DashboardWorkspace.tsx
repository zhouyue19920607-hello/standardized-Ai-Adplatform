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
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('main.pendingAssets')} ({rawFiles.length})</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="text-[11px] font-bold text-primary bg-white px-4 py-2 rounded-full shadow-ios hover:bg-slate-50 transition-all active:scale-95"
                                        >
                                            {t('main.addMore')}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setRawFiles([]);
                                                setProcessedAssets([]);
                                            }}
                                            className="text-[11px] font-bold text-red-500 bg-white px-4 py-2 rounded-full shadow-ios hover:bg-red-50 transition-all active:scale-95"
                                        >
                                            {t('main.clearAll')}
                                        </button>
                                    </div>
                                </div>
                                <div className={`grid gap-5 pb-2 transition-all duration-400 ${isCollapsed ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 opacity-60' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5'}`}>
                                    {rawFiles.map(raw => (
                                        <div key={raw.id} className={`liquid-glass relative group p-1 transition-all lens-effect ${isCollapsed ? 'scale-90 hover:scale-100' : ''}`}>
                                            <div className={`relative bg-slate-100 flex items-center justify-center overflow-hidden rounded-[16px] ${isCollapsed ? 'aspect-square' : 'aspect-[4/3]'}`}>
                                                {raw.file.type.startsWith('video/') ? (
                                                    <div className="w-full h-full flex items-center justify-center bg-slate-900">
                                                        {raw.thumbnailUrl ? (
                                                            <img src={raw.thumbnailUrl} className="w-full h-full object-contain opacity-60" alt="thumb" />
                                                        ) : (
                                                            <span className="material-symbols-outlined text-white/50 text-3xl">play_circle</span>
                                                        )}
                                                        <span className="absolute material-symbols-outlined text-white text-3xl">play_circle</span>
                                                    </div>
                                                ) : (
                                                    <img
                                                        src={raw.previewUrl}
                                                        className="w-full h-full object-contain"
                                                        alt="raw"
                                                    />
                                                )}
                                                <button
                                                    onClick={() => removeRawFile(raw.id)}
                                                    className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md"
                                                >
                                                    <span className="material-symbols-outlined text-sm">close</span>
                                                </button>
                                            </div>
                                            {!isCollapsed && (
                                                <div className="p-3">
                                                    <p className="text-[10px] text-slate-700 truncate font-bold">{raw.file.name}</p>
                                                    <p className="text-[9px] text-slate-400 font-black mt-0.5">{Math.round(raw.file.size / 1024)} KB</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
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
