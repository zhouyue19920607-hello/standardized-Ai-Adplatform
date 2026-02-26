import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { AdAsset, AdConfig } from '../types';
import { ASSETS_URL } from '../services/api';
import { getDerivedGradientColor, hexToRgb } from '../utils/colorUtils';
import { useLanguage } from '../contexts/LanguageContext';
import { compositeAsset } from '../utils/assetCompositor';

interface PreviewGridProps {
  assets: AdAsset[];
  config: AdConfig;
  onClear: () => void;
  onToggleMask: () => void;
  onUpdateAsset?: (assetId: string, updates: Partial<AdAsset>) => void;
  isGenerating?: boolean;
}

const parseAspectRatio = (dimensions: string) => {
  const parts = dimensions.split('x').map(p => parseInt(p.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return `${parts[0]} / ${parts[1]}`;
  }
  return '16 / 9';
};

const AdCard: React.FC<{
  asset: AdAsset;
  globalShowMask: boolean;
  config: AdConfig;
  onZoom: (asset: AdAsset, showMask: boolean, showCrop: boolean, showBadge: boolean) => void;
  onUpdate?: (updates: Partial<AdAsset>) => void;
}> = ({ asset, globalShowMask, config, onZoom, onUpdate }) => {
  const { t } = useLanguage();
  const [localShowMask, setLocalShowMask] = useState(globalShowMask);
  const [isEditingText, setIsEditingText] = useState(false);
  const [localSplashText, setLocalSplashText] = useState(asset.splashText || t('preview.defaultSplashText'));
  const [localShowCrop, setLocalShowCrop] = useState(config.showCrop);
  const [localShowBadge, setLocalShowBadge] = useState(false);

  const isHotRecommend = asset.id.includes('mt-ib-1');
  const isHotSearch = asset.id.includes('mt-ib-2');
  const isTopicBg = asset.id.includes('mt-ib-3');
  const isTopicBanner = asset.id.includes('mt-ib-4');
  const isPopup = asset.category === '弹窗';
  const isScorePopup = isPopup && asset.id.includes('mt-p-1');
  const isHomePopup = isPopup && (asset.id.includes('mt-p-2') || asset.id.includes('mt-p-3'));
  const isImmersiveFocal = asset.templateName.includes('沉浸式');
  // NOTE: 一键配方图文，图片在蒙版上方，需要特殊分层处理
  const isRecipeContent = asset.id.includes('mt-fe-1');
  const isStaticFocal = asset.category === '焦点视窗' && !isImmersiveFocal && !asset.templateName.includes('动态');
  const focalAssetsPath = isImmersiveFocal ? '/focal-window-immersive' : '/focal-window';

  const aspectRatio = (localShowMask && (asset.category === '焦点视窗' || isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isPopup || isRecipeContent))
    ? '1126 / 2436'
    : (localShowMask && asset.category === '开屏')
      ? '1440 / 2340'
      : asset.dimensions?.replace(' x ', ' / ') || '1080 / 1920';

  useEffect(() => {
    setLocalShowMask(globalShowMask);
  }, [globalShowMask]);

  // NOTE: 监听全局「全显裁剪」开关，同步到每张卡片的本地状态
  useEffect(() => {
    setLocalShowCrop(config.showCrop);
  }, [config.showCrop]);

  const handleDownload = async () => {
    if (asset.type.startsWith('video')) {
      alert('此网站仅支持视频卡片预览及图片格式保存。');
      return;
    }

    const safeName = (asset.templateName || asset.name || 'image').replace(/[\/\\:*?"<>|]/g, '_');

    const downloadCanvasAsJpg = (canvas: HTMLCanvasElement, filename: string) => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 100);
      }, 'image/jpeg', 0.9);
    };

    const downloadAsBlob = async (url: string, filename: string) => {
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', filename);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
        }, 100);
      } catch (e) {
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        link.click();
      }
    };

    try {
      // Use the centralized compositor
      const blob = await compositeAsset(asset, {
        ...config,
        showMask: localShowMask,
        showCrop: localShowCrop,
      });

      // Determine extension from MIME type
      let ext = 'jpg';
      if (asset.type.startsWith('video') || blob.type.startsWith('video/')) ext = 'mp4';
      else if (blob.type === 'image/png') ext = 'png';
      else if (blob.type === 'image/webp') ext = 'webp';

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${safeName}.${ext}`);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error("Individual download failed", err);
      // Fallback: direct download link
      const link = document.createElement('a');
      link.href = asset.url;
      const fallbackExt = asset.type.startsWith('video') ? 'mp4' : 'jpg';
      link.setAttribute('download', `${safeName}.${fallbackExt}`);
      link.click();
    }
  };

  return (
    <div className="liquid-glass lens-effect group hover:shadow-2xl transition-all duration-500 overflow-hidden flex flex-col h-full border border-white/20">
      <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between gap-2 bg-white/5">
        <div className="flex items-center gap-2 overflow-hidden w-full">
          <span className="text-primary text-[9px] uppercase font-bold tracking-widest shrink-0">{t(`apps.${asset.app}`)}</span>
          <span className="text-[9px] text-slate-400 font-bold font-mono shrink-0">{asset.dimensions}</span>
          <h3 className="font-bold text-slate-900 text-xs truncate flex-1">{t(`templates.${asset.templateName}`) !== `templates.${asset.templateName}` ? t(`templates.${asset.templateName}`) : asset.templateName}</h3>
        </div>
      </div>
      <div
        className="relative bg-white overflow-hidden cursor-zoom-in w-full group/preview"
        style={{ aspectRatio, containerType: 'size' }}
        onDoubleClick={() => onZoom({ ...asset, splashText: localSplashText }, localShowMask, localShowCrop, localShowBadge)}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-full relative transition-transform duration-700 group-hover/preview:scale-[1.02]">
            {asset.type.startsWith('video') ? (
              <video
                src={asset.url}
                className={`w-full h-full ${localShowMask && isImmersiveFocal ? 'absolute inset-0 z-0 object-cover' : (localShowMask && (asset.category === '开屏' || asset.category === '焦点视窗' || asset.category === '弹窗' || asset.id.includes('mt-ib-4')) ? 'relative z-10 object-contain object-top' : 'relative z-10 object-cover')}`}
                controls={false}
                autoPlay
                playsInline
                loop
                muted
              />
            ) : (!(isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isPopup || isRecipeContent) && (
              // NOTE: mt-s-5（非全屏动态）开启遮罩时，图片固定从顶部对齐，以匹配蒙版中的非全屏图片区域
              (localShowMask && asset.id.includes('mt-s-5'))
                ? <img src={asset.url} alt={asset.name} className="absolute top-0 left-0 w-full z-10" style={{ height: 'auto' }} />
                : <img src={asset.url} alt={asset.name} className={`${(isImmersiveFocal && localShowMask) ? 'absolute inset-0 z-0' : 'relative z-10'} w-full h-full ${localShowMask && asset.category === '焦点视窗' ? 'object-contain object-top' : 'object-contain'}`} />
            ))}

            {/* Hot Recommend Background Mask (Lower Layer) */}
            {isHotRecommend && localShowMask && asset.maskUrl && (
              <div className="absolute inset-0 z-0 bg-white pointer-events-none mix-blend-normal">
                <img
                  src={`${ASSETS_URL}${asset.maskUrl}`}
                  className="w-full h-full object-contain"
                  alt="Mask Background"
                />
              </div>
            )}

            {/* Focal Window Mask (Lower Layer - for transparent PNGs) */}
            {localShowMask && (isStaticFocal || isImmersiveFocal) && asset.maskUrl && (
              <div className="absolute inset-0 z-0 bg-white pointer-events-none mix-blend-normal">
                <img
                  src={`${ASSETS_URL}${asset.maskUrl}`}
                  className="w-full h-full object-contain"
                  alt="Mask Background"
                />
              </div>
            )}

            {/* Topic Background UI Mask (Overlay Layer) */}
            {isTopicBg && localShowMask && asset.maskUrl && (
              <div className="absolute inset-0 z-20 pointer-events-none mix-blend-normal">
                <img
                  src={`${ASSETS_URL}${asset.maskUrl}`}
                  className="w-full h-full object-contain"
                  alt="Mask Overlay"
                />
              </div>
            )}


            {/* Home Popup Mask (Lower Layer - below popup image) */}
            {isHomePopup && localShowMask && asset.maskUrl && (
              <div className="absolute inset-0 z-10 pointer-events-none mix-blend-normal">
                <img src={`${ASSETS_URL}${asset.maskUrl}`} className="w-full h-full object-contain" alt="Popup Mask" />
              </div>
            )}

            {/* Standard Mask (Overlay Layer - for other categories) */}
            {localShowMask && asset.maskUrl && !(isHotRecommend || isTopicBg || isHomePopup || isRecipeContent || isStaticFocal || isImmersiveFocal) && (
              <div className="absolute inset-0 z-20 pointer-events-none text-transparent"><img src={`${ASSETS_URL}${asset.maskUrl}`} className="w-full h-full object-contain" /></div>
            )}

            {/* 一键配方图文: Mask 在图片下方 (z-[15]), 图片将在上方 (z-[40]) */}
            {isRecipeContent && localShowMask && asset.maskUrl && (
              <div className="absolute inset-0 z-[15] pointer-events-none">
                <img src={`${ASSETS_URL}${asset.maskUrl}`} className="w-full h-full object-contain" alt="Recipe Mask" />
              </div>
            )}

            {localShowMask && asset.category === '焦点视窗' && !asset.maskUrl && (
              (() => {
                const baseColor = asset.aiExtractedColor || '#FF00FF';
                const gradColor = asset.gradientColor || getDerivedGradientColor(baseColor);
                return (
                  <div className="absolute inset-0">
                    <div className="absolute inset-0 z-[40]"><img src={`${focalAssetsPath}/fixed_bg_1.png`} className="w-full h-full object-fill" /></div>
                    <div className="absolute inset-0 z-[30]" style={{ maskImage: `url(${focalAssetsPath}/icon_bg.png)`, WebkitMaskImage: `url(${focalAssetsPath}/icon_bg.png)`, backgroundColor: baseColor, maskSize: '100% 100%' }} />
                    <div className="absolute left-0 right-0 z-[20]" style={{ top: `${(isImmersiveFocal ? 1600 : 750) / 2436 * 100}%`, height: '20.5%', backgroundColor: gradColor, maskImage: 'linear-gradient(to bottom, transparent 0%, white 10%, white 30%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, white 10%, white 30%, transparent 100%)' }} />
                    <div className="absolute inset-0 z-[10]"><img src={`${focalAssetsPath}/fixed_bg_2.png`} className="w-full h-full object-fill" /></div>
                  </div>
                );
              })()
            )}

            {asset.category === '开屏' && localShowMask && (
              <div className="absolute inset-x-0 text-center pointer-events-none z-[60]" style={{ bottom: asset.id.includes('mt-s-5') ? '23.5%' : (asset.templateName === '上下滑动开屏' ? '10.5%' : (asset.templateName === '扭动开屏' ? '10.8%' : '7.5%')) }}>
                <div className={`inline-block transition-all duration-300 pointer-events-auto ${isEditingText ? 'ring-2 ring-primary bg-black/20 rounded-ios p-1' : ''}`} style={{
                  fontSize: (asset.id.includes('mt-s-5') || asset.templateName === '上下滑动开屏') ? '2.48cqh' : (asset.templateName === '扭动开屏' ? '1.54cqh' : '1.79cqh'),
                  letterSpacing: '0.05em'
                }}>
                  {isEditingText ? (
                    <input autoFocus className="bg-transparent border-none text-white focus:ring-0 p-0 text-center w-64" value={localSplashText} onChange={e => setLocalSplashText(e.target.value)} onBlur={() => { setIsEditingText(false); onUpdate?.({ splashText: localSplashText }); }} />
                  ) : <span className="text-white text-center block font-bold shadow-sm">{localSplashText}</span>}
                </div>
              </div>
            )}

            {/* Hot Search Text (热搜词第四位文案) */}
            {isHotSearch && localShowMask && (
              <div className="absolute pointer-events-none z-[40]" style={{ left: '31.08%', top: '54.19%' }}>
                <div className={`transition-all duration-300 pointer-events-auto ${isEditingText ? 'ring-2 ring-primary bg-black/20 rounded-ios p-1' : ''}`} style={{ fontSize: '1.64cqh', fontFamily: '-apple-system, "PingFang SC", "Helvetica Neue", sans-serif', fontWeight: 500 }}>
                  {isEditingText ? (
                    <input autoFocus className="bg-transparent border-none text-black focus:ring-0 p-0 text-left w-48" value={localSplashText} onChange={e => setLocalSplashText(e.target.value)} onBlur={() => { setIsEditingText(false); onUpdate?.({ splashText: localSplashText }); }} />
                  ) : <span className="text-black block">{localSplashText}</span>}
                </div>
              </div>
            )}
            {/* Final Layers: Special Results (on top of masks) */}
            {(isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isPopup || isRecipeContent) && !asset.type.startsWith('video') && (
              <div
                className={`absolute ${(isHotSearch || isTopicBanner) ? 'z-20' : (isPopup ? 'z-40' : (isRecipeContent ? 'z-[40]' : 'z-10'))}`}
                style={{
                  ...(localShowMask ? (isHotRecommend ? { width: '25.57%', height: '15.76%', left: '62.87%', top: '73.02%' } : (isHotSearch ? { width: '13.86%', height: '6.40%', left: '14.92%', top: '53.08%' } : (isScorePopup ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '19.91%' } : (isHomePopup ? { width: '85.26%', left: '7.37%', top: '50%', transform: 'translateY(-50%)' } : (isTopicBanner ? { width: '91.47%', height: '11.82%', left: '4.27%', top: '40.23%' } : (isRecipeContent ? { width: '44.968%', height: '27.717%', left: '4.085%', top: '61.124%' } : { width: '100%', height: '26.27%', left: 0, top: 0 })))))) : { inset: 0 }),
                  containerType: 'size'
                }}
              >
                <img src={asset.url} alt={asset.name} className={`w-full h-full ${localShowMask ? (isTopicBanner ? 'object-cover rounded-[5px]' : (isHomePopup ? 'object-contain' : (isScorePopup ? 'object-cover rounded-[10px]' : (isRecipeContent ? 'object-cover rounded-[10px]' : (isHotRecommend || isHotSearch) ? 'object-cover rounded-[10px]' : 'object-cover')))) : 'object-contain'}`} />
              </div>
            )}
          </div>
        </div>

        {localShowCrop && asset.cropOverlayUrl && (
          <div className="absolute inset-0 z-20 pointer-events-none"><img src={`${ASSETS_URL}${asset.cropOverlayUrl}`} className="w-full h-full object-contain" /></div>
        )}
        {localShowBadge && asset.badgeOverlayUrl && (asset.category === '焦点视窗' || asset.category === '弹窗' || isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isRecipeContent) && (
          <div
            className={`absolute pointer-events-none ${(isHotSearch || isTopicBanner) ? 'z-[45]' : (isScorePopup ? 'z-[55]' : (isHomePopup ? 'z-[55]' : (isTopicBg ? 'z-[15]' : (isRecipeContent ? 'z-[50]' : 'z-[50]'))))}`}
            style={localShowMask ? (isHotRecommend ? { width: '25.57%', height: '15.76%', left: '62.87%', top: '73.02%' } : (isHotSearch ? { width: '13.86%', height: '6.40%', left: '14.92%', top: '53.08%' } : (isScorePopup ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '19.91%' } : (isHomePopup ? { width: '85.26%', left: '7.37%', top: '50%', transform: 'translateY(-50%)' } : (isTopicBanner ? { width: '91.47%', height: '11.82%', left: '4.27%', top: '40.23%' } : (isRecipeContent ? { width: '44.968%', height: '27.717%', left: '4.085%', top: '61.124%' } : (isTopicBg ? { width: '100%', height: '26.27%', left: 0, top: 0 } : { top: 0, left: 0, width: '100%', height: isImmersiveFocal ? '100%' : '37%' }))))))) : { inset: 0 }}>
            <img src={`${ASSETS_URL}${asset.badgeOverlayUrl}`} className={`w-full h-full ${localShowMask ? (isPopup ? (isScorePopup ? 'object-cover' : (isHomePopup ? 'object-contain' : 'object-cover')) : (isTopicBanner ? 'object-contain' : (isRecipeContent ? 'object-contain object-top' : 'object-contain object-top'))) : 'object-contain'}`} />
          </div>
        )}

        {/* Score Popup Text (mt-p-1) Top Layer */}
        {isScorePopup && asset.splashText && (
          <div
            className="absolute pointer-events-none z-[70]"
            style={{
              ...(localShowMask ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '19.91%' } : { inset: 0 }),
              containerType: 'size'
            }}
          >
            <div className="absolute inset-x-0 text-center pointer-events-none" style={{ bottom: '13.4cqh', transform: 'translateY(5px)' }}>
              <div className={`inline-block transition-all duration-300 pointer-events-auto ${isEditingText ? 'ring-2 ring-primary bg-black/20 rounded-ios p-1' : ''}`} style={{
                fontSize: '2.77cqh',
                fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
                fontWeight: 400
              }}>
                {isEditingText ? (
                  <input autoFocus className="bg-transparent border-none text-white focus:ring-0 p-0 text-center w-64" value={localSplashText} onChange={e => setLocalSplashText(e.target.value)} onBlur={() => { setIsEditingText(false); onUpdate?.({ splashText: localSplashText }); }} />
                ) : <span className="text-white text-center block shadow-sm">{localSplashText}</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 border-t border-slate-100 flex items-center justify-between mt-auto bg-slate-50/30">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setLocalShowMask(!localShowMask)}
            className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 transition-all text-[10px] font-bold shadow-sm ${localShowMask ? 'bg-primary text-white shadow-primary/20' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
          >
            <span className="material-symbols-outlined text-[16px]">{localShowMask ? 'visibility' : 'visibility_off'}</span>
            <span>{localShowMask ? t('preview.adMask') : t('preview.rawAsset')}</span>
          </button>

          {asset.cropOverlayUrl && (
            <button
              onClick={() => setLocalShowCrop(!localShowCrop)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-sm ${localShowCrop ? 'bg-orange-500 text-white shadow-orange-500/20' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
              title={t('preview.cropPreview')}
            >
              <span className="material-symbols-outlined text-[18px]">crop</span>
            </button>
          )}

          {(asset.category === '开屏' || isHotSearch || isScorePopup) && localShowMask && (
            <button
              onClick={() => setIsEditingText(!isEditingText)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-sm ${isEditingText ? 'bg-primary text-white shadow-primary/20' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
              title={t('preview.editText')}
            >
              <span className="material-symbols-outlined text-[18px]">edit_note</span>
            </button>
          )}

          {(asset.category === '焦点视窗' || asset.category === '弹窗' || isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isRecipeContent) && asset.badgeOverlayUrl && (
            <button
              onClick={() => setLocalShowBadge(!localShowBadge)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-sm ${localShowBadge ? 'bg-purple-500 text-white shadow-purple-500/20' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
              title={t('preview.brandComponent')}
            >
              <span className="material-symbols-outlined text-[18px]">verified</span>
            </button>
          )}
        </div>
        <button
          onClick={handleDownload}
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-white text-slate-400 hover:text-primary transition-all active:scale-95 border border-slate-200 shadow-sm"
          title={t('preview.download')}
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
        </button>
      </div>
    </div>
  );
};

const PreviewGrid: React.FC<PreviewGridProps> = ({ assets, config, onClear, onToggleMask, onUpdateAsset, isGenerating }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('all');
  const [selectedAssetInfo, setSelectedAssetInfo] = useState<{ asset: AdAsset, showMask: boolean, showCrop?: boolean, showBadge?: boolean } | null>(null);

  const filteredAssets = activeTab === 'all' ? assets : assets.filter(a => a.category === activeTab);
  const selectedAsset = selectedAssetInfo?.asset;

  if (assets.length === 0 && !isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-300 h-full min-h-[400px]">
        <span className="material-symbols-outlined text-6xl mb-4">grid_view</span>
        <p className="font-bold text-lg">{t('preview.noContent')}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="p-6 pt-0 relative">
        {isGenerating && assets.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-md z-20">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
            <p className="text-slate-800 font-bold tracking-widest text-xs uppercase animate-pulse">{t('preview.generating')}</p>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-6 pb-20">
          {filteredAssets.map(asset => (
            <AdCard key={asset.id} asset={asset} globalShowMask={config.showMask} config={config} onZoom={(a, showMask, showCrop, showBadge) => setSelectedAssetInfo({ asset: a, showMask, showCrop, showBadge })} onUpdate={updates => onUpdateAsset?.(asset.id, updates)} />
          ))}
        </div>
      </div>

      {selectedAsset && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/55 backdrop-blur-sm flex items-start justify-center pt-4 animate-in fade-in duration-200" onClick={() => setSelectedAssetInfo(null)}>
          <button className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors z-[10000]" onClick={() => setSelectedAssetInfo(null)}><span className="material-symbols-outlined text-4xl">close</span></button>
          <div
            className="relative flex items-center justify-center overflow-hidden shadow-2xl bg-white"
            style={{
              aspectRatio: (selectedAssetInfo.showMask && (selectedAsset.category === '焦点视窗' || selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-3') || selectedAsset.id.includes('mt-ib-4') || selectedAsset.id.includes('mt-p-') || selectedAsset.id.includes('mt-fe-'))) ? '1126 / 2436' : (selectedAssetInfo.showMask && selectedAsset.category === '开屏') ? '1440 / 2340' : parseAspectRatio(selectedAsset.dimensions || '1080x1920'),
              height: '92vh',
              containerType: 'size'
            }}
            onClick={e => e.stopPropagation()}
          >
            {!(selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-3') || selectedAsset.id.includes('mt-ib-4') || selectedAsset.category === '弹窗' || selectedAsset.id.includes('mt-fe-1')) && (
              selectedAsset.type.startsWith('video') ? (
                <video
                  src={selectedAsset.url}
                  className={`w-full h-full ${selectedAssetInfo.showMask && selectedAsset.templateName.includes('沉浸式') ? 'absolute inset-0 z-0 object-cover' : (selectedAssetInfo.showMask && (selectedAsset.category === '开屏' || selectedAsset.category === '焦点视窗') ? 'relative z-10 object-contain object-top' : 'relative z-10 object-cover')}`}
                  controls
                  playsInline
                  loop
                  muted
                />
              ) : (
                // NOTE: mt-s-5（非全屏动态）开启遮罩时，图片固定从顶部对齐以匹配蒙版的图片区域
                (selectedAssetInfo.showMask && selectedAsset.id.includes('mt-s-5'))
                  ? <img src={selectedAsset.url} alt="zoom" className="absolute top-0 left-0 w-full z-10" style={{ height: 'auto' }} />
                  : <img src={selectedAsset.url} alt="zoom" className={`${(selectedAsset.templateName.includes('沉浸式') && selectedAssetInfo.showMask) ? 'absolute inset-0 z-0' : 'relative z-10'} w-full h-full ${selectedAssetInfo.showMask && selectedAsset.category === '焦点视窗' ? 'object-contain object-top' : 'object-contain'}`} />
              )
            )}

            {/* Modal: Extra Video Support for Popups / Topic Assets */}
            {(selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-3') || selectedAsset.id.includes('mt-ib-4') || selectedAsset.category === '弹窗') && selectedAsset.type.startsWith('video') && (
              <div
                className={`absolute ${(selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-4')) ? 'z-[40]' : (selectedAsset.category === '弹窗' ? 'z-[50]' : 'z-10')}`}
                style={selectedAssetInfo.showMask ? (
                  selectedAsset.id.includes('mt-ib-1') ? { width: '25.57%', height: '15.76%', left: '62.87%', top: '73.02%' } :
                    selectedAsset.id.includes('mt-ib-2') ? { width: '13.86%', height: '6.40%', left: '14.92%', top: '53.08%' } :
                      selectedAsset.id.includes('mt-p-1') ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '19.91%' } :
                        (selectedAsset.id.includes('mt-p-2') || selectedAsset.id.includes('mt-p-3')) ? { width: '85.26%', left: '7.37%', top: '50%', transform: 'translateY(-50%)' } :
                          selectedAsset.id.includes('mt-ib-4') ? { width: '91.47%', height: '11.82%', left: '4.27%', top: '40.23%' } :
                            { width: '100%', height: '26.27%', left: 0, top: 0 }
                ) : { inset: 0 }}
              >
                <video
                  src={selectedAsset.url}
                  className={`w-full h-full ${selectedAssetInfo.showMask ? (selectedAsset.id.includes('mt-ib-4') ? 'object-cover rounded-[5px]' : (selectedAsset.id.includes('mt-p-1') ? 'object-cover rounded-[10px]' : (selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2')) ? 'object-cover rounded-[10px]' : 'object-contain')) : 'object-contain'}`}
                  controls
                  playsInline
                  loop
                  muted
                />
              </div>
            )}

            {/* Modal Overlays: Masks */}
            {selectedAssetInfo.showMask && selectedAsset.maskUrl && selectedAsset.id.includes('mt-ib-1') && (
              <div className="absolute inset-0 pointer-events-none z-0 mix-blend-normal">
                <img src={`${ASSETS_URL}${selectedAsset.maskUrl}`} className="w-full h-full object-contain" alt="zoom mask bg" />
              </div>
            )}

            {/* Modal: Focal Window Mask (Lower Layer - for transparent PNGs) */}
            {selectedAssetInfo.showMask && selectedAsset.maskUrl && (selectedAsset.category === '焦点视窗') && (
              <div className="absolute inset-0 z-0 bg-white pointer-events-none mix-blend-normal">
                <img src={`${ASSETS_URL}${selectedAsset.maskUrl}`} className="w-full h-full object-contain" alt="zoom mask bg" />
              </div>
            )}

            {/* Modal: Focal Window Dynamic UI Background (for transparent PNGs) */}
            {selectedAssetInfo.showMask && selectedAsset.category === '焦点视窗' && !selectedAsset.maskUrl && (
              <div className="absolute inset-0 z-0 bg-white" />
            )}

            {selectedAssetInfo.showMask && selectedAsset.maskUrl && selectedAsset.id.includes('mt-ib-3') && (
              <div className="absolute inset-0 pointer-events-none z-20 mix-blend-normal">
                <img src={`${ASSETS_URL}${selectedAsset.maskUrl}`} className="w-full h-full object-contain" alt="zoom mask overlay" />
              </div>
            )}


            {/* Modal: Home Popup Mask (Lower Layer - below popup image) */}
            {selectedAssetInfo.showMask && selectedAsset.maskUrl && selectedAsset.category === '弹窗' && !selectedAsset.id.startsWith('mt-p-1') && (
              <div className="absolute inset-0 pointer-events-none z-10 mix-blend-normal">
                <img src={`${ASSETS_URL}${selectedAsset.maskUrl}`} className="w-full h-full object-contain" alt="popup mask" />
              </div>
            )}

            {/* Modal: Recipe Content Mask (Lower Layer) */}
            {selectedAssetInfo.showMask && selectedAsset.maskUrl && selectedAsset.id.includes('mt-fe-1') && (
              <div className="absolute inset-0 pointer-events-none z-[15] mix-blend-normal">
                <img src={`${ASSETS_URL}${selectedAsset.maskUrl}`} className="w-full h-full object-contain" alt="recipe mask" />
              </div>
            )}

            {/* Modal Overlays: Standard Mask Overlay */}
            {selectedAssetInfo.showMask && selectedAsset.maskUrl && !(selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-3') || selectedAsset.category === '弹窗' || selectedAsset.id.includes('mt-fe-1') || selectedAsset.category === '焦点视窗') && (
              <div className="absolute inset-0 pointer-events-none z-20 mix-blend-normal">
                <img src={`${ASSETS_URL}${selectedAsset.maskUrl}`} className="w-full h-full object-contain" alt="zoom mask" />
              </div>
            )}

            {/* Modal: Focal Window Dynamic UI (when no mask) */}
            {selectedAssetInfo.showMask && selectedAsset.category === '焦点视窗' && !selectedAsset.maskUrl && (
              (() => {
                const isImmersiveFocal = selectedAsset.templateName.includes('沉浸式');
                const focalAssetsPath = isImmersiveFocal ? '/focal-window-immersive' : '/focal-window';
                const baseColor = selectedAsset.aiExtractedColor || '#FF00FF';
                const gradColor = selectedAsset.gradientColor || getDerivedGradientColor(baseColor);
                return (
                  <div className="absolute inset-0">
                    <div className="absolute inset-0 z-[40]"><img src={`${focalAssetsPath}/fixed_bg_1.png`} className="w-full h-full object-fill" /></div>
                    <div className="absolute inset-0 z-[30]" style={{ maskImage: `url(${focalAssetsPath}/icon_bg.png)`, WebkitMaskImage: `url(${focalAssetsPath}/icon_bg.png)`, backgroundColor: baseColor, maskSize: '100% 100%' }} />
                    <div className="absolute left-0 right-0 z-[20]" style={{ top: `${(isImmersiveFocal ? 1600 : 750) / 2436 * 100}%`, height: '20.5%', backgroundColor: gradColor, maskImage: 'linear-gradient(to bottom, transparent 0%, white 10%, white 30%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, white 10%, white 30%, transparent 100%)' }} />
                    <div className="absolute inset-0 z-[10]"><img src={`${focalAssetsPath}/fixed_bg_2.png`} className="w-full h-full object-fill" /></div>
                  </div>
                );
              })()
            )}
            {selectedAssetInfo.showCrop && selectedAsset.cropOverlayUrl && (
              <div className="absolute inset-0 z-20 pointer-events-none"><img src={`${ASSETS_URL}${selectedAsset.cropOverlayUrl}`} className="w-full h-full object-contain" /></div>
            )}
            {selectedAssetInfo.showBadge && (selectedAsset.category === '焦点视窗' || selectedAsset.category === '弹窗' || selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-3') || selectedAsset.id.includes('mt-ib-4') || selectedAsset.id.includes('mt-fe-1')) && selectedAsset.badgeOverlayUrl && (
              <div
                className={`absolute pointer-events-none ${(selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-4')) ? 'z-[45]' : (selectedAsset.id.includes('mt-p-1') ? 'z-[55]' : (selectedAsset.category === '弹窗' ? 'z-[55]' : (selectedAsset.id.includes('mt-ib-3') ? 'z-[15]' : (selectedAsset.id.includes('mt-fe-1') ? 'z-[55]' : 'z-[50]'))))}`}
                style={selectedAssetInfo.showMask ? (
                  selectedAsset.id.includes('mt-ib-1') ? { width: '25.57%', height: '15.76%', left: '62.87%', top: '73.02%' } :
                    selectedAsset.id.includes('mt-ib-2') ? { width: '13.86%', height: '6.40%', left: '14.92%', top: '53.08%' } :
                      selectedAsset.id.includes('mt-p-1') ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '19.91%' } :
                        (selectedAsset.id.includes('mt-p-2') || selectedAsset.id.includes('mt-p-3')) ? { width: '85.26%', left: '7.37%', top: '50%', transform: 'translateY(-50%)' } :
                          selectedAsset.id.includes('mt-ib-4') ? { width: '91.47%', height: '11.82%', left: '4.27%', top: '40.23%' } :
                            selectedAsset.id.includes('mt-ib-3') ? { width: '100%', height: '26.27%', left: 0, top: 0 } :
                              selectedAsset.id.includes('mt-fe-1') ? { width: '44.968%', height: '27.717%', left: '4.085%', top: '61.124%' } :
                                { top: 0, left: 0, width: '100%', height: selectedAsset.templateName.includes('沉浸式') ? '100%' : '37%' }
                ) : { inset: 0 }}>
                <img src={`${ASSETS_URL}${selectedAsset.badgeOverlayUrl}`} className={`w-full h-full ${selectedAssetInfo.showMask ? (selectedAsset.category === '弹窗' ? (selectedAsset.id.includes('mt-p-1') ? 'object-cover rounded-[10px]' : 'object-contain') : (selectedAsset.id.includes('mt-ib-4') ? 'object-contain' : (selectedAsset.id.includes('mt-fe-1') ? 'object-contain object-top' : 'object-contain object-top'))) : 'object-contain'}`} />
              </div>
            )}

            {/* Modal Splash Text Overlay (Fullscreen 開屏) */}
            {selectedAsset.category === '开屏' && selectedAssetInfo.showMask && (
              <div className="absolute inset-x-0 text-center pointer-events-none z-[60]"
                style={{ bottom: selectedAsset.id.includes('mt-s-5') ? 'calc(26.07% - 5px)' : (selectedAsset.templateName === '上下滑动开屏' ? 'calc(12.18% - 5px)' : (selectedAsset.templateName === '扭动开屏' ? '12.48%' : '8.97%')), transform: selectedAsset.id.includes('mt-s-2') ? 'translateY(-2px)' : (selectedAsset.id.includes('mt-s-1') || selectedAsset.id.includes('mt-s-3') || selectedAsset.id.includes('mt-s-4')) ? 'translateY(2px)' : 'none' }}>
                <div className="inline-block" style={{ fontSize: (selectedAsset.id.includes('mt-s-5') || selectedAsset.templateName === '上下滑动开屏') ? '2.48cqh' : (selectedAsset.templateName === '扭动开屏' ? '1.54cqh' : '1.79cqh'), letterSpacing: '0.05em' }}>
                  <span className="text-white text-center block font-bold shadow-sm">{selectedAsset.splashText || t('preview.defaultSplashText')}</span>
                </div>
              </div>
            )}

            {/* Modal: Hot Search Text */}
            {selectedAsset.id.includes('mt-ib-2') && selectedAssetInfo.showMask && (
              <div className="absolute pointer-events-none z-[40]" style={{ left: '31.08%', top: '54.19%' }}>
                <div style={{ fontSize: '1.64cqh', fontFamily: '-apple-system, "PingFang SC", "Helvetica Neue", sans-serif', fontWeight: 500 }}>
                  <span className="text-black block">{selectedAsset.splashText || t('preview.defaultSplashText')}</span>
                </div>
              </div>
            )}

            {/* Modal: Final Result Layers (on top of masks) */}
            {(selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-3') || selectedAsset.id.includes('mt-ib-4') || selectedAsset.category === '弹窗' || selectedAsset.id.includes('mt-fe-1')) && (
              <div
                className={`absolute ${(selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-4')) ? 'z-[40]' : (selectedAsset.category === '弹窗' ? 'z-[50]' : (selectedAsset.id.includes('mt-fe-1') ? 'z-[40]' : 'z-10'))}`}
                style={{
                  ...(selectedAssetInfo.showMask ? (
                    selectedAsset.id.includes('mt-ib-1') ? { width: '25.57%', height: '15.76%', left: '62.87%', top: '73.02%' } :
                      selectedAsset.id.includes('mt-ib-2') ? { width: '13.86%', height: '6.40%', left: '14.92%', top: '53.08%' } :
                        selectedAsset.id.includes('mt-p-1') ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '19.91%' } :
                          (selectedAsset.id.includes('mt-p-2') || selectedAsset.id.includes('mt-p-3')) ? { width: '85.26%', left: '7.37%', top: '50%', transform: 'translateY(-50%)' } :
                            selectedAsset.id.includes('mt-ib-4') ? { width: '91.47%', height: '11.82%', left: '4.27%', top: '40.23%' } :
                              selectedAsset.id.includes('mt-fe-1') ? { width: '44.968%', height: '27.717%', left: '4.085%', top: '61.124%' } :
                                { width: '100%', height: '26.27%', left: 0, top: 0 }
                  ) : { inset: 0 }),
                  containerType: 'size'
                }}
              >
                <img src={selectedAsset.url} alt={selectedAsset.name} className={`w-full h-full ${selectedAssetInfo.showMask ? (selectedAsset.id.includes('mt-ib-4') ? 'object-cover rounded-[5px]' : (selectedAsset.id.includes('mt-p-1') ? 'object-cover rounded-[10px]' : (selectedAsset.id.includes('mt-fe-1') ? 'object-cover rounded-[10px]' : (selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2')) ? 'object-cover rounded-[10px]' : 'object-cover'))) : 'object-contain'}`} />
              </div>
            )}

            {/* Modal: Score Popup Text (mt-p-1) Top Layer */}
            {selectedAsset.id.includes('mt-p-1') && selectedAsset.splashText && (
              <div
                className="absolute pointer-events-none z-[75]"
                style={{
                  ...(selectedAssetInfo.showMask ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '19.91%' } : { inset: 0 }),
                  containerType: 'size'
                }}
              >
                <div className="absolute inset-x-0 text-center pointer-events-none" style={{ bottom: '13.4cqh', transform: 'translateY(5px)' }}>
                  <div style={{ fontSize: '2.77cqh', fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif', fontWeight: 400 }}>
                    <span className="text-white text-center block shadow-sm">{selectedAsset.splashText}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )
      }
    </div >
  );
};

export default PreviewGrid;
