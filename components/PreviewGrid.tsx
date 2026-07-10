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
  const defaultShowBadge = asset.showBadge ?? (asset.category === '焦点视窗' && !!asset.badgeOverlayUrl);
  const [localShowMask, setLocalShowMask] = useState(globalShowMask);
  const [isEditingText, setIsEditingText] = useState(false);
  const [localSplashText, setLocalSplashText] = useState(asset.splashText || t('preview.defaultSplashText'));
  const [localShowCrop, setLocalShowCrop] = useState(config.showCrop);
  const [localShowBadge, setLocalShowBadge] = useState(defaultShowBadge);
  const [isDownloading, setIsDownloading] = useState(false);
  // NOTE: 三平台开屏样式切换本地状态
  const [activeSplashStyle, setActiveSplashStyle] = useState<'meitu' | 'beauty' | 'wink'>(asset.activeSplashStyle ?? 'meitu');

  const isSplashWithPlatforms = asset.category === '开屏' && !!asset.splashPlatformMasks;

  // NOTE: 根据当前平台样式动态计算 maskUrl 供预览使用
  const effectiveMaskUrl = isSplashWithPlatforms
    ? (asset.splashPlatformMasks![activeSplashStyle] ?? asset.maskUrl)
    : asset.maskUrl;

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
  const isNonFullscreenSplash = asset.id.includes('mt-s-5') || asset.id.includes('mt-s-6') || asset.templateName.includes('非全屏');
  const isUpDownSliding = asset.templateName.includes('上下滑动') && !asset.templateName.includes('非全屏');
  const focalAssetsPath = isImmersiveFocal ? '/focal-window-immersive' : '/focal-window';
  const shouldUsePlatformFocalMask = localShowMask && isStaticFocal && (asset.app === '美颜' || asset.app === 'wink') && !!effectiveMaskUrl;
  const shouldRenderFixedFocalChrome = localShowMask && asset.category === '焦点视窗' && !asset.templateName.includes('动态') && !shouldUsePlatformFocalMask;
  const shouldOffsetMeiyanFocal = localShowMask && asset.category === '焦点视窗' && asset.app === '美颜' && !!effectiveMaskUrl;
  const meiyanFocalOffsetStyle = shouldOffsetMeiyanFocal ? { transform: 'translateY(-3.9819cqh)' } : undefined;
  const shouldAlignMeiyanFocalBadge = shouldOffsetMeiyanFocal && !!asset.badgeOverlayUrl;

  const aspectRatio = (localShowMask && (asset.category === '焦点视窗' || isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isPopup || isRecipeContent))
    ? ((asset.app === 'wink' || asset.app === '美颜') ? '1126 / 2438' : '1126 / 2436')
    : (localShowMask && asset.category === '开屏')
      ? '1440 / 2340'
      : asset.dimensions?.replace(' x ', ' / ') || '1080 / 1920';

  useEffect(() => {
    setLocalShowMask(globalShowMask);
  }, [globalShowMask]);

  useEffect(() => {
    setLocalShowBadge(asset.showBadge ?? (asset.category === '焦点视窗' && !!asset.badgeOverlayUrl));
  }, [asset.showBadge, asset.category, asset.badgeOverlayUrl]);

  // NOTE: 监听全局「全显裁剪」开关，同步到每张卡片的本地状态
  useEffect(() => {
    setLocalShowCrop(config.showCrop);
  }, [config.showCrop]);

  const handleDownload = async () => {
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

    setIsDownloading(true);
    try {
      if (asset.type.startsWith('video')) {
        // NOTE: Dynamic import to avoid circular logic or initialization errors
        const { exportVideoElements } = await import('../utils/videoCompositor');
        const { compositeVideo } = await import('../services/api');

        const vDim = { w: 1080, h: 1920 };
        const match = asset.dimensions?.match(/(\d+)\s*x\s*(\d+)/i);
        if (match) { vDim.w = parseInt(match[1]); vDim.h = parseInt(match[2]); }

        const videoResp = await fetch(asset.url);
        const videoBlob = await videoResp.blob();
        const videoLimitMB =
          asset.category === '开屏' ? 4 :
          asset.category === '焦点视窗' ? 10 :
          asset.id.includes('mt-p-1') || asset.id.includes('mt-ib-1') ? 4 :
          undefined;
        const hasVideoOverlay =
          Boolean(localShowMask) ||
          Boolean(localShowCrop && asset.cropOverlayUrl) ||
          Boolean(localShowBadge && asset.badgeOverlayUrl) ||
          Boolean(asset.category === '开屏' && localShowMask && (asset.splashText || config.splashText)) ||
          Boolean(asset.id.includes('mt-p-1') && asset.splashText);

        if (videoLimitMB && !hasVideoOverlay && videoBlob.size <= videoLimitMB * 1024 * 1024) {
          await downloadAsBlob(asset.url, `${safeName}.mp4`);
          setIsDownloading(false);
          return;
        }

        const params = await exportVideoElements(asset, {
          ...config, showMask: localShowMask, showCrop: localShowCrop, showBadge: localShowBadge
        }, vDim);

        const shouldLimitFocalVideo =
          asset.category === '焦点视窗';
        const shouldLimitSplashVideo =
          asset.category === '开屏';
        const shouldLimitScorePopupVideo =
          asset.id.includes('mt-p-1');
        const shouldLimitHotRecommendVideo =
          asset.id.includes('mt-ib-1');
        const result = await compositeVideo(videoBlob, params.bgBlob, params.fgBlob, {
          targetW: params.targetW,
          targetH: params.targetH,
          videoRect: params.videoRect,
          ...(shouldLimitFocalVideo ? { maxSizeMB: 10 } : {}),
          ...(shouldLimitSplashVideo ? { maxSizeMB: 4 } : {}),
          ...(shouldLimitScorePopupVideo ? { maxSizeMB: 4 } : {}),
          ...(shouldLimitHotRecommendVideo ? { maxSizeMB: 4 } : {}),
          ...(asset.id.includes('mt-p-1') ? { maxDurationSec: 5 } : {})
        });

        if (result.ok && result.url) {
          await downloadAsBlob(`${ASSETS_URL}${result.url}`, `${safeName}.mp4`);
        } else {
          throw new Error(result.error || "Video composition failed");
        }
        setIsDownloading(false);
        return;
      }

      // Use the centralized compositor for images
      const blob = await compositeAsset(asset, {
        ...config,
        showMask: localShowMask,
        showCrop: localShowCrop,
        showBadge: localShowBadge
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
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="standard-preview-card group transition-all duration-300 overflow-hidden flex flex-col h-full pb-2 relative">
      <div className="px-3 pt-3 pb-2 flex flex-col items-center justify-center gap-1 bg-transparent shrink-0">
        {/* Dimension Text */}
        <span className="text-[12px] text-slate-400 font-bold font-mono tracking-[0.1em] shrink min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-center">
          {localShowMask && asset.category === '焦点视窗' 
            ? ((asset.app === 'wink' || asset.app === '美颜') ? '1126 x 2438' : '1126 x 2436') 
            : asset.dimensions}
        </span>
      </div>
      <div
        className="standard-preview-media relative bg-white overflow-hidden cursor-zoom-in w-full group/preview shrink-0"
        style={{ aspectRatio, containerType: 'size' }}
        onDoubleClick={() => onZoom({ ...asset, splashText: localSplashText }, localShowMask, localShowCrop, localShowBadge)}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-full relative transition-transform duration-700 group-hover/preview:scale-[1.02]">
            {/* NOTE: 生成等待时显示骨架屏动画 */}
            {asset.isLoading ? (
              asset.loadingMode === 'ai' ? (
                <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(129,140,248,0.28),transparent_34%),linear-gradient(145deg,#f8fafc_0%,#eef2ff_50%,#fdf2f8_100%)]">
                  <div className="absolute inset-0 opacity-55 bg-[linear-gradient(rgba(99,102,241,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.08)_1px,transparent_1px)] bg-[size:22px_22px]" />
                  <div className="absolute inset-x-8 top-8 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent animate-ai-scan-y" />
                  <div className="absolute left-1/2 top-[42%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 shadow-[0_20px_60px_rgba(99,102,241,0.22)] border border-white/80 flex items-center justify-center animate-ai-bob">
                    <div className="absolute inset-2 rounded-full border border-indigo-200/80" />
                    <div className="absolute inset-0 rounded-full border border-dashed border-indigo-300/70 animate-ai-orbit" />
                    <span className="material-symbols-outlined text-[34px] text-indigo-500 drop-shadow-sm">auto_awesome</span>
                    <span className="absolute -right-1 top-5 h-3 w-3 rounded-full bg-fuchsia-400 shadow-[0_0_18px_rgba(217,70,239,0.65)] animate-pulse" />
                    <span className="absolute bottom-1 left-4 h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.65)] animate-pulse" />
                  </div>
                  <div className="absolute left-5 right-5 bottom-5 rounded-[18px] border border-white/70 bg-white/72 px-4 py-3 shadow-lg backdrop-blur-md">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-black text-slate-800">{asset.loadingLabel || 'AI 正在智能排版'}</p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] font-bold leading-snug text-slate-500">{asset.loadingHint || '正在拆解主体、文案与安全区'}</p>
                      </div>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/25">
                        <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      {['读图', '扩图', '排版'].map((step, index) => (
                        <div key={step} className="h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-400 to-sky-400 animate-ai-progress"
                            style={{ animationDelay: `${index * 0.35}s` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                  <div className="relative">
                    <div className="w-10 h-10 border-3 border-slate-300 border-t-primary rounded-full animate-spin" style={{ borderWidth: '3px' }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-4 h-4 bg-primary/20 rounded-full animate-pulse" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold mt-3 animate-pulse tracking-normal text-left">{asset.loadingLabel || '生成中'}</p>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                </div>
              )
            ) : asset.type.startsWith('video') && !(isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isPopup || isRecipeContent) ? (
              <video
                src={asset.url}
                className={`w-full h-full ${localShowMask && isImmersiveFocal ? 'absolute inset-0 z-0 object-cover' : (localShowMask && (asset.category === '开屏' || asset.category === '焦点视窗' || asset.category === '弹窗' || asset.id.includes('mt-ib-4')) ? 'relative z-10 object-contain object-top' : 'relative z-10 object-contain')}`}
                style={meiyanFocalOffsetStyle}
                controls={false}
                autoPlay
                playsInline
                loop
                muted
              />
            ) : (!(isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isPopup || isRecipeContent) && (
              // NOTE: mt-s-5（非全屏动态）开启遮罩时，图片固定从顶部对齐，以匹配蒙版中的非全屏图片区域
              (localShowMask && isNonFullscreenSplash)
                ? <img src={asset.url} alt={asset.name} className="absolute top-0 left-0 w-full z-10" style={{ height: 'auto' }} />
                : <img src={asset.url} alt={asset.name} className={`${(isImmersiveFocal && localShowMask) ? 'absolute inset-0 z-0' : 'relative z-10'} w-full h-full ${localShowMask && asset.category === '焦点视窗' ? 'object-contain object-top' : 'object-contain'}`} style={meiyanFocalOffsetStyle} />
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

            {shouldRenderFixedFocalChrome && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 z-[10]">
                  <img src={`${focalAssetsPath}/fixed_bg_2.png`} className="w-full h-full object-fill" alt="" />
                </div>
                {!isImmersiveFocal && (
                  <div className="absolute inset-0 z-[20]">
                    <img src={`${focalAssetsPath}/gradient_layer.png`} className="w-full h-full object-fill" alt="" />
                  </div>
                )}
                <div
                  className="absolute inset-0 z-[30]"
                  style={{
                    backgroundColor: asset.aiExtractedColor || '#FF00FF',
                    maskImage: `url(${focalAssetsPath}/icon_bg.png)`,
                    WebkitMaskImage: `url(${focalAssetsPath}/icon_bg.png)`,
                    maskSize: '100% 100%',
                    WebkitMaskSize: '100% 100%',
                  }}
                />
                <div className="absolute inset-0 z-[40]">
                  <img src={`${focalAssetsPath}/fixed_bg_1.png`} className="w-full h-full object-fill" alt="" />
                </div>
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


            {/* Popup Mask (Background - below user image) */}
            {localShowMask && asset.maskUrl && (isHomePopup || isScorePopup) && (
              <div className="absolute inset-0 z-10 pointer-events-none mix-blend-normal">
                <img src={`${ASSETS_URL}${asset.maskUrl}`} className="w-full h-full object-contain" alt="Popup Background" />
              </div>
            )}

            {/* Standard Mask (Overlay Layer - for other categories including 开屏, plus Meiyan/Wink Focal Window) */}
            {localShowMask && effectiveMaskUrl && !(isHotRecommend || isTopicBg || isHomePopup || isRecipeContent || shouldRenderFixedFocalChrome) && (
              <div className="absolute inset-0 z-20 pointer-events-none text-transparent"><img src={`${ASSETS_URL}${effectiveMaskUrl}`} className="w-full h-full object-contain" /></div>
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
              <div className="absolute inset-x-0 text-center pointer-events-none z-[60]" style={{ bottom: isNonFullscreenSplash ? '23.5%' : (isUpDownSliding ? '10.5%' : (asset.templateName === '扭动全屏' ? '10.8%' : '7.5%')) }}>
                <div className={`inline-block transition-all duration-300 pointer-events-auto ${isEditingText ? 'ring-2 ring-primary bg-black/20 rounded-ios p-1' : ''}`} style={{
                  fontSize: (isNonFullscreenSplash || isUpDownSliding) ? '2.48cqh' : (asset.templateName === '扭动全屏' ? '1.54cqh' : '1.79cqh'),
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
            {(isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isPopup || isRecipeContent) && asset.type.startsWith('video') && (
              <div
                className={`absolute ${(isHotSearch || isTopicBanner) ? 'z-20' : (isPopup ? 'z-40' : (isRecipeContent ? 'z-[40]' : 'z-10'))}`}
                style={{
                  ...(localShowMask ? (isHotRecommend ? { width: '25.57%', height: '15.76%', left: '62.87%', top: '73.02%' } : (isHotSearch ? { width: '13.86%', height: '6.40%', left: '14.92%', top: '53.08%' } : (isScorePopup ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '20.44%' } : (isHomePopup ? { width: '85.26%', height: '39.41%', left: '7.37%', top: '30.30%' } : (isTopicBanner ? { width: '91.47%', height: '11.82%', left: '4.27%', top: '40.23%' } : (isRecipeContent ? { width: '44.968%', height: '27.717%', left: '4.085%', top: '61.124%' } : { width: '100%', height: '26.27%', left: 0, top: 0 })))))) : { inset: 0 }),
                  containerType: 'size'
                }}
              >
                <video
                  src={asset.url}
                  className={`w-full h-full ${localShowMask ? (isTopicBanner ? 'object-cover rounded-[5px]' : (isHomePopup ? 'object-contain' : (isScorePopup ? 'object-cover rounded-[10px]' : (isRecipeContent ? 'object-cover rounded-[10px]' : (isHotRecommend || isHotSearch) ? 'object-cover rounded-[10px]' : 'object-cover')))) : (isHotRecommend ? 'object-contain rounded-[10px]' : 'object-contain')}`}
                  controls={false}
                  autoPlay
                  playsInline
                  loop
                  muted
                />
              </div>
            )}
            {(isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isPopup || isRecipeContent) && !asset.type.startsWith('video') && (
              <div
                className={`absolute ${(isHotSearch || isTopicBanner) ? 'z-20' : (isPopup ? 'z-40' : (isRecipeContent ? 'z-[40]' : 'z-10'))}`}
                style={{
                  ...(localShowMask ? (isHotRecommend ? { width: '25.57%', height: '15.76%', left: '62.87%', top: '73.02%' } : (isHotSearch ? { width: '13.86%', height: '6.40%', left: '14.92%', top: '53.08%' } : (isScorePopup ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '20.44%' } : (isHomePopup ? { width: '85.26%', height: '39.41%', left: '7.37%', top: '30.30%' } : (isTopicBanner ? { width: '91.47%', height: '11.82%', left: '4.27%', top: '40.23%' } : (isRecipeContent ? { width: '44.968%', height: '27.717%', left: '4.085%', top: '61.124%' } : { width: '100%', height: '26.27%', left: 0, top: 0 })))))) : { inset: 0 }),
                  containerType: 'size'
                }}
              >
                <img src={asset.url} alt={asset.name} className={`w-full h-full ${localShowMask ? (isTopicBanner ? 'object-cover rounded-[5px]' : (isHomePopup ? 'object-contain' : (isScorePopup ? 'object-cover rounded-[10px]' : (isRecipeContent ? 'object-cover rounded-[10px]' : (isHotRecommend || isHotSearch) ? 'object-cover rounded-[10px]' : 'object-cover')))) : (isHotRecommend ? 'object-contain rounded-[10px]' : 'object-contain')}`} />
              </div>
            )}
          </div>
        </div>

        {localShowCrop && asset.cropOverlayUrl && (
          // NOTE: mt-s-5（非全屏动态）裁剪层跟随结果图，从顶部对齐而非撑满容器
          isNonFullscreenSplash
            ? <div className="absolute top-0 left-0 w-full z-20 pointer-events-none"><img src={`${ASSETS_URL}${asset.cropOverlayUrl}`} className="w-full" style={{ height: 'auto' }} /></div>
            : <div className="absolute inset-0 z-20 pointer-events-none"><img src={`${ASSETS_URL}${asset.cropOverlayUrl}`} className="w-full h-full object-contain" /></div>
        )}
        {localShowBadge && asset.badgeOverlayUrl && (asset.category === '焦点视窗' || asset.category === '弹窗' || isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isRecipeContent) && (
          <div
            className={`absolute pointer-events-none ${(isHotSearch || isTopicBanner) ? 'z-[45]' : (isScorePopup ? 'z-[55]' : (isHomePopup ? 'z-[55]' : (isTopicBg ? 'z-[15]' : (isRecipeContent ? 'z-[50]' : 'z-[50]'))))}`}
            style={localShowMask ? (shouldAlignMeiyanFocalBadge ? { inset: 0, ...meiyanFocalOffsetStyle } : (isHotRecommend ? { width: '25.57%', height: '15.76%', left: '62.87%', top: '73.02%' } : (isHotSearch ? { width: '13.86%', height: '6.40%', left: '14.92%', top: '53.08%' } : (isScorePopup ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '19.91%' } : (isHomePopup ? { width: '85.26%', left: '7.37%', top: '50%', transform: 'translateY(-50%)' } : (isTopicBanner ? { width: '91.47%', height: '11.82%', left: '4.27%', top: '40.23%' } : (isRecipeContent ? { width: '44.968%', height: '27.717%', left: '4.085%', top: '61.124%' } : (isTopicBg ? { width: '100%', height: '26.27%', left: 0, top: 0 } : { top: 0, left: 0, width: '100%', height: isImmersiveFocal ? '100%' : '37%' })))))))) : { inset: 0 }}>
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

      {/* Bottom Toolbar Layout Match (Moved Above Mask Style) */}
      <div className="px-4 py-3 flex items-center justify-center gap-[14px] w-full max-w-full overflow-hidden shrink-0 mt-auto bg-transparent">
        {/* Toggle Mask Button */}
        <button
          onClick={() => setLocalShowMask(!localShowMask)}
          className={`w-[36px] h-[30px] rounded-[10px] flex items-center justify-center transition-all duration-300 shadow-sm shrink-0 ${localShowMask ? 'bg-[#007AE7] text-white shadow-blue-500/40' : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200/50'}`}
        >
          <span className="material-symbols-outlined text-[18px]">{localShowMask ? 'visibility' : 'visibility_off'}</span>
        </button>

        {asset.cropOverlayUrl && (
          <button
            onClick={() => setLocalShowCrop(!localShowCrop)}
            className={`flex items-center justify-center transition-colors ${localShowCrop ? 'text-orange-500' : 'text-slate-700 hover:text-black hover:scale-110'}`}
            title={t('preview.cropPreview')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px', strokeWidth: 1.5 }}>crop</span>
          </button>
        )}

        {(asset.category === '开屏' || isHotSearch || isScorePopup) && localShowMask && (
          <button
            onClick={() => setIsEditingText(!isEditingText)}
            className={`flex items-center justify-center transition-colors ${isEditingText ? 'text-[#007AE7]' : 'text-slate-700 hover:text-black hover:scale-110'}`}
            title={t('preview.editText')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>filter_list</span>
          </button>
        )}

        {asset.category !== '开屏' && asset.aiExtractedColors && asset.aiExtractedColors.length > 1 && (
          <button
            onClick={() => {
              const colors = asset.aiExtractedColors || [];
              const currentIdx = colors.findIndex(c => c.iconColor === asset.aiExtractedColor) ?? -1;
              const nextIdx = (currentIdx + 1) % colors.length;
              const next = colors[nextIdx];
              if (next) {
                onUpdate?.({
                  aiExtractedColor: next.iconColor,
                  gradientColor: next.gradientColor
                });
              }
            }}
            className="flex items-center justify-center transition-colors text-slate-700 hover:text-black hover:scale-110"
            title="切换配色"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>casino</span>
          </button>
        )}

        {(asset.category === '焦点视窗' || asset.category === '弹窗' || isHotRecommend || isHotSearch || isTopicBg || isTopicBanner || isRecipeContent) && asset.badgeOverlayUrl && (
          <button
            onClick={() => {
              const next = !localShowBadge;
              setLocalShowBadge(next);
              onUpdate?.({ showBadge: next });
            }}
            className={`flex items-center justify-center transition-colors ${localShowBadge ? 'text-purple-500' : 'text-slate-700 hover:text-black hover:scale-110'}`}
            title={t('preview.brandComponent')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>verified</span>
          </button>
        )}

        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center justify-center transition-colors text-slate-700 hover:text-black hover:scale-110"
          title={t('preview.download')}
        >
          {isDownloading ? (
            <div className="w-[18px] h-[18px] border-[2px] border-slate-300 border-t-slate-800 rounded-full animate-spin" />
          ) : (
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>download</span>
          )}
        </button>
      </div>

      {/* 蒙版样式 (Platform Mask Switch) - Moved to bottom */}
      {isSplashWithPlatforms && localShowMask && (
        <div className="w-full shrink-0 flex flex-col items-center pt-1 pb-4">
          <div className="w-[90%] max-w-[280px]">
            <h4 className="text-[12px] font-bold text-slate-800 mb-2.5 px-1 tracking-wider text-center">蒙版样式</h4>
            <div className="flex items-center gap-2 justify-center w-full">
              {(['meitu', 'beauty', 'wink'] as const).map((platform) => {
                const imgIcons: Record<string, string> = { meitu: '/icons/meitu_mask_icon.png', beauty: '/icons/beauty_mask_icon.png', wink: '/icons/wink_mask_icon.png' };
                const hasMask = !!asset.splashPlatformMasks![platform];
                const isSelected = activeSplashStyle === platform;
                return (
                  <button
                    key={platform}
                    disabled={!hasMask}
                    onClick={() => {
                      setActiveSplashStyle(platform);
                      onUpdate?.({ activeSplashStyle: platform, maskUrl: asset.splashPlatformMasks![platform] });
                    }}
                    className={`flex-1 flex items-center justify-center py-2 h-[42px] rounded-[10px] border-2 transition-all duration-300 ${!hasMask ? 'border-transparent bg-slate-100/50 opacity-40 cursor-not-allowed' :
                      isSelected ? 'border-blue-500 bg-white shadow-sm scale-[1.02]' : 'border-transparent bg-[#FAFBFC] shadow-sm hover:scale-[1.02] hover:shadow-md'
                      }`}
                  >
                    {imgIcons[platform] && (
                      <div className={`w-[26px] h-[26px] transition-all duration-300 overflow-hidden ${isSelected ? 'scale-105 drop-shadow-md' : 'opacity-[0.85] scale-95 grayscale-[15%]'}`}>
                        <img src={imgIcons[platform]} className="w-full h-full object-contain" alt={platform} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PreviewGrid: React.FC<PreviewGridProps> = ({ assets, config, onClear, onToggleMask, onUpdateAsset, isGenerating }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('all');
  const [selectedAssetInfo, setSelectedAssetInfo] = useState<{ asset: AdAsset, showMask: boolean, showCrop?: boolean, showBadge?: boolean } | null>(null);

  const filteredAssets = activeTab === 'all' ? assets : assets.filter(a => a.category === activeTab);
  const templatePreviewAsset = assets.find(asset => asset.id.startsWith('template-preview-'));
  const selectedAsset = selectedAssetInfo?.asset;
  const shouldUseSelectedPlatformFocalMask = !!selectedAsset && selectedAssetInfo?.showMask && selectedAsset.category === '焦点视窗' && !selectedAsset.templateName.includes('动态') && (selectedAsset.app === '美颜' || selectedAsset.app === 'wink') && !!selectedAsset.maskUrl;
  const shouldOffsetSelectedMeiyanFocal = !!selectedAsset && selectedAssetInfo?.showMask && selectedAsset.category === '焦点视窗' && selectedAsset.app === '美颜' && !!selectedAsset.maskUrl;
  const selectedMeiyanFocalOffsetStyle = shouldOffsetSelectedMeiyanFocal ? { transform: 'translateY(-3.9819cqh)' } : undefined;
  const shouldAlignSelectedMeiyanFocalBadge = shouldOffsetSelectedMeiyanFocal && !!selectedAsset?.badgeOverlayUrl;

  if (assets.length === 0 && !isGenerating) {
    return (
      <div className="standard-empty-guide flex-1 flex flex-col items-center justify-start pt-3 p-4 h-full min-h-[430px]">
        <div className="standard-empty-guide-inner max-w-4xl w-full space-y-0 animate-in fade-in slide-in-from-top-4 duration-700 font-medium tracking-wide">
          {/* Top Border */}
          <div className="h-[1px] w-full bg-slate-200/40 mb-4"></div>

          {/* Title */}
          <div className="text-center py-1 mb-5">
            <h2 className="standard-empty-title text-base font-black text-slate-500/80 tracking-normal text-left">操作说明与素材限制</h2>
          </div>

          {/* Main Grid Content (Two columns for two situations) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-6">

            {/* Situation 1 */}
            <div className="standard-empty-card standard-empty-card--blue space-y-4 p-5 rounded-2xl transition-all duration-300 group">
              <div className="flex items-center gap-3 text-slate-700 border-b border-slate-200 pb-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">rule</span>
                </div>
                <h3 className="font-bold text-[13px] tracking-wide relative">
                  情况一：素材尺寸符合要求
                  <span className="absolute -bottom-[13px] left-0 w-8 h-0.5 bg-blue-500 rounded-full scale-0 group-hover:scale-100 transition-transform origin-left"></span>
                </h3>
              </div>
              <ul className="space-y-3 text-[12px] text-slate-500 leading-relaxed pt-2">
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-blue-400 shrink-0">visibility</span>
                  <span>能够结合我们的<strong>安全区域（MR）</strong>和<strong>互动样式</strong>，预览图片或视频的最终表现。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-blue-400 shrink-0">compress</span>
                  <span>自动将生成或导出的图片文件体积优化并<strong>保持在 200K 以内</strong>，并且支持针对视频输出<strong>首尾帧截图</strong>。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-blue-400 shrink-0">palette</span>
                  <span>对于<strong>焦点视窗</strong>，支持智能取色功能以及手动精准调色配置。</span>
                </li>
              </ul>
              <div className="rounded-xl border border-blue-100/80 bg-white/70 px-4 py-3">
                <p className="text-[11px] font-black text-slate-600 mb-2">生成预览工具</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-bold text-slate-500 leading-snug">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[15px] text-blue-400 shrink-0">visibility</span>
                    <span>查看不同平台交互样式</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[15px] text-blue-400 shrink-0">crop</span>
                    <span>查看开屏裁剪区域</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[15px] text-blue-400 shrink-0">filter_list</span>
                    <span>手动输入跳转文案</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[15px] text-blue-400 shrink-0">download</span>
                    <span>单独下载当前预览画面</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Situation 2 */}
            <div className="standard-empty-card standard-empty-card--purple space-y-4 p-5 rounded-2xl transition-all duration-300 group">
              <div className="flex items-center gap-3 text-slate-700 border-b border-slate-200 pb-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                </div>
                <h3 className="font-bold text-[13px] tracking-wide relative">
                  情况二：无法提供符合 MR 的素材
                  <span className="absolute -bottom-[13px] left-0 w-8 h-0.5 bg-purple-500 rounded-full scale-0 group-hover:scale-100 transition-transform origin-left"></span>
                </h3>
              </div>
              <ul className="space-y-3 text-[12px] text-slate-500 leading-relaxed pt-2">
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-purple-400 shrink-0">smart_toy</span>
                  <span>当素材尺寸不符合当前模板，或一张图片需要适配多个模板时，系统会提示使用<strong> AI 适配</strong>。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-purple-400 shrink-0">aspect_ratio</span>
                  <span>AI 仅在确认后参与扩图、裁切、背景补全、主体位置调整、安全区避让与智能排版。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-rose-400 shrink-0">warning</span>
                  <span className="text-rose-500/90 font-medium">当前该功能【仅支持针对图片进行改动】，视频素材暂无法进行 AI 智能扩展及排版。</span>
                </li>
              </ul>
            </div>

          </div>

          <div className="h-[1px] w-full bg-slate-200/40 mt-8"></div>
        </div>
      </div>
    );
  }

  if (templatePreviewAsset && !isGenerating) {
    return (
      <div className="w-full">
        <div className="px-6 pt-2 pb-6 flex items-start justify-center">
          <div className="animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-2 flex items-center justify-center gap-2 text-xs font-black text-slate-500">
              <span className="material-symbols-outlined text-[16px] text-blue-500">movie</span>
              <span>{templatePreviewAsset.templateName} 样式预览</span>
            </div>
            {templatePreviewAsset.type.startsWith('video') ? (
              <div className="template-preview-asset-stage mx-auto flex w-[clamp(320px,34vw,480px)] max-w-[92vw] items-center justify-center">
                <video
                  src={templatePreviewAsset.url}
                  className="block max-h-[72vh] w-full object-contain rounded-[22px]"
                  controls={false}
                  autoPlay
                  playsInline
                  loop
                  muted
                />
              </div>
            ) : (
              <div className="template-preview-asset-stage mx-auto flex w-[clamp(320px,34vw,480px)] max-w-[92vw] items-center justify-center">
                <img
                  src={templatePreviewAsset.url}
                  alt={templatePreviewAsset.templateName}
                  className="block max-h-[72vh] w-full object-contain"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="standard-preview-grid-shell p-5 pt-0 relative">
        {isGenerating && assets.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-md z-20">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
            <p className="text-slate-800 font-bold tracking-normal text-left text-xs animate-pulse">{t('preview.generating')}</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 pb-20">
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
              aspectRatio: (selectedAssetInfo.showMask && (selectedAsset.category === '焦点视窗' || selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-3') || selectedAsset.id.includes('mt-ib-4') || selectedAsset.id.includes('mt-p-') || selectedAsset.id.includes('mt-fe-'))) ? ((selectedAsset.app === 'wink' || selectedAsset.app === '美颜') ? '1126 / 2438' : '1126 / 2436') : (selectedAssetInfo.showMask && selectedAsset.category === '开屏') ? '1440 / 2340' : parseAspectRatio(selectedAsset.dimensions || '1080x1920'),
              height: '92vh',
              containerType: 'size'
            }}
            onClick={e => e.stopPropagation()}
          >
            {!(selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-3') || selectedAsset.id.includes('mt-ib-4') || selectedAsset.category === '弹窗' || selectedAsset.id.includes('mt-fe-1')) && (
              selectedAsset.type.startsWith('video') ? (
                <video
                  src={selectedAsset.url}
                  className={`w-full h-full ${selectedAssetInfo.showMask && selectedAsset.templateName.includes('沉浸式') ? 'absolute inset-0 z-[15] object-cover' : (selectedAssetInfo.showMask && (selectedAsset.category === '焦点视窗' || selectedAsset.category === '开屏') ? 'relative z-10 object-contain object-top' : 'relative z-10 object-contain')}`}
                  style={selectedMeiyanFocalOffsetStyle}
                  controls
                  autoPlay
                  playsInline
                  loop
                  muted
                />
              ) : (
                // NOTE: mt-s-5（非全屏动态）开启遮罩时，图片固定从顶部对齐以匹配蒙版的图片区域
                (selectedAssetInfo.showMask && (selectedAsset.id.includes('mt-s-5') || selectedAsset.id.includes('mt-s-6') || selectedAsset.templateName.includes('非全屏')))
                  ? <img src={selectedAsset.url} alt="zoom" className="absolute top-0 left-0 w-full z-10" style={{ height: 'auto' }} />
                  : <img src={selectedAsset.url} alt="zoom" className={`${(selectedAsset.templateName.includes('沉浸式') && selectedAssetInfo.showMask) ? 'absolute inset-0 z-[15]' : 'relative z-10'} w-full h-full ${selectedAssetInfo.showMask && selectedAsset.category === '焦点视窗' ? 'object-contain object-top' : 'object-contain'}`} style={selectedMeiyanFocalOffsetStyle} />
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
                  autoPlay
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

            {selectedAssetInfo.showMask && selectedAsset.category === '焦点视窗' && !selectedAsset.templateName.includes('动态') && !shouldUseSelectedPlatformFocalMask && (
              (() => {
                const isImmersiveFocal = selectedAsset.templateName.includes('沉浸式');
                const focalAssetsPath = isImmersiveFocal ? '/focal-window-immersive' : '/focal-window';
                return (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 z-[10]"><img src={`${focalAssetsPath}/fixed_bg_2.png`} className="w-full h-full object-fill" alt="" /></div>
                    {!isImmersiveFocal && (
                      <div className="absolute inset-0 z-[20]"><img src={`${focalAssetsPath}/gradient_layer.png`} className="w-full h-full object-fill" alt="" /></div>
                    )}
                    <div
                      className="absolute inset-0 z-[30]"
                      style={{
                        backgroundColor: selectedAsset.aiExtractedColor || '#FF00FF',
                        maskImage: `url(${focalAssetsPath}/icon_bg.png)`,
                        WebkitMaskImage: `url(${focalAssetsPath}/icon_bg.png)`,
                        maskSize: '100% 100%',
                        WebkitMaskSize: '100% 100%',
                      }}
                    />
                    <div className="absolute inset-0 z-[40]"><img src={`${focalAssetsPath}/fixed_bg_1.png`} className="w-full h-full object-fill" alt="" /></div>
                  </div>
                );
              })()
            )}

            {/* Modal: Focal Window Dynamic UI Background (for transparent PNGs) */}
            {selectedAssetInfo.showMask && selectedAsset.category === '焦点视窗' && !selectedAsset.maskUrl && (
              <div className="absolute inset-0 z-0 bg-white" />
            )}

            {shouldUseSelectedPlatformFocalMask && selectedAsset.maskUrl && (
              <div className="absolute inset-0 pointer-events-none z-20 mix-blend-normal">
                <img src={`${ASSETS_URL}${selectedAsset.maskUrl}`} className="w-full h-full object-contain" alt="platform focal mask" />
              </div>
            )}

            {selectedAssetInfo.showMask && selectedAsset.maskUrl && selectedAsset.id.includes('mt-ib-3') && (
              <div className="absolute inset-0 pointer-events-none z-20 mix-blend-normal">
                <img src={`${ASSETS_URL}${selectedAsset.maskUrl}`} className="w-full h-full object-contain" alt="zoom mask overlay" />
              </div>
            )}


            {/* Modal: Popup Mask (Background - below user image) */}
            {selectedAssetInfo.showMask && selectedAsset.maskUrl && (selectedAsset.id.includes('mt-p-1') || selectedAsset.id.includes('mt-p-2') || selectedAsset.id.includes('mt-p-3')) && (
              <div className="absolute inset-0 pointer-events-none z-10 mix-blend-normal">
                <img src={`${ASSETS_URL}${selectedAsset.maskUrl}`} className="w-full h-full object-contain" alt="popup background" />
              </div>
            )}

            {/* Modal: Recipe Content Mask (Lower Layer) */}
            {selectedAssetInfo.showMask && selectedAsset.maskUrl && selectedAsset.id.includes('mt-fe-1') && (
              <div className="absolute inset-0 pointer-events-none z-[15] mix-blend-normal">
                <img src={`${ASSETS_URL}${selectedAsset.maskUrl}`} className="w-full h-full object-contain" alt="recipe mask" />
              </div>
            )}

            {/* Modal Overlays: Standard Mask Overlay (Top Layer - for Meiyan, Wink, and Splash) */}
            {selectedAssetInfo.showMask && selectedAsset.maskUrl && !(selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-3') || selectedAsset.category === '弹窗' || selectedAsset.id.includes('mt-fe-1') || shouldUseSelectedPlatformFocalMask || (selectedAsset.category === '焦点视窗' && !selectedAsset.templateName.includes('动态'))) && (
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
              // NOTE: mt-s-5（非全屏动态）裁剪层在弹窗中同样从顶部对齐
              (selectedAsset.id.includes('mt-s-5') || selectedAsset.id.includes('mt-s-6') || selectedAsset.templateName.includes('非全屏'))
                ? <div className="absolute top-0 left-0 w-full z-20 pointer-events-none"><img src={`${ASSETS_URL}${selectedAsset.cropOverlayUrl}`} className="w-full" style={{ height: 'auto' }} /></div>
                : <div className="absolute inset-0 z-20 pointer-events-none"><img src={`${ASSETS_URL}${selectedAsset.cropOverlayUrl}`} className="w-full h-full object-contain" /></div>
            )}
            {selectedAssetInfo.showBadge && (selectedAsset.category === '焦点视窗' || selectedAsset.category === '弹窗' || selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-3') || selectedAsset.id.includes('mt-ib-4') || selectedAsset.id.includes('mt-fe-1')) && selectedAsset.badgeOverlayUrl && (
              <div
                className={`absolute pointer-events-none ${(selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-4')) ? 'z-[45]' : (selectedAsset.id.includes('mt-p-1') ? 'z-[55]' : (selectedAsset.category === '弹窗' ? 'z-[55]' : (selectedAsset.id.includes('mt-ib-3') ? 'z-[15]' : (selectedAsset.id.includes('mt-fe-1') ? 'z-[55]' : 'z-[50]'))))}`}
                style={selectedAssetInfo.showMask ? (
                  selectedAsset.id.includes('mt-ib-1') ? { width: '25.57%', height: '15.76%', left: '62.87%', top: '73.02%' } :
                    selectedAsset.id.includes('mt-ib-2') ? { width: '13.86%', height: '6.40%', left: '14.92%', top: '53.08%' } :
                      selectedAsset.id.includes('mt-p-1') ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '20.44%' } :
                        (selectedAsset.id.includes('mt-p-2') || selectedAsset.id.includes('mt-p-3')) ? { width: '85.26%', left: '7.37%', top: '30.30%', height: '39.41%' } :
                          selectedAsset.id.includes('mt-ib-4') ? { width: '91.47%', height: '11.82%', left: '4.27%', top: '40.23%' } :
                            selectedAsset.id.includes('mt-ib-3') ? { width: '100%', height: '26.27%', left: 0, top: 0 } :
                              selectedAsset.id.includes('mt-fe-1') ? { width: '44.968%', height: '27.717%', left: '4.085%', top: '61.124%' } :
                                shouldAlignSelectedMeiyanFocalBadge ? { inset: 0, ...selectedMeiyanFocalOffsetStyle } :
                                  { top: 0, left: 0, width: '100%', height: selectedAsset.templateName.includes('沉浸式') ? '100%' : '37%' }
                ) : { inset: 0 }}>
                <img src={`${ASSETS_URL}${selectedAsset.badgeOverlayUrl}`} className={`w-full h-full ${selectedAssetInfo.showMask ? (selectedAsset.category === '弹窗' ? (selectedAsset.id.includes('mt-p-1') ? 'object-cover rounded-[10px]' : 'object-contain') : (selectedAsset.id.includes('mt-ib-4') ? 'object-contain' : (selectedAsset.id.includes('mt-fe-1') ? 'object-contain object-top' : (selectedAsset.templateName.includes('沉浸式') ? 'object-cover object-top' : 'object-contain object-top')))) : 'object-contain'}`} />
              </div>
            )}

            {/* Modal Splash Text Overlay (Fullscreen 開屏) */}
            {selectedAsset.category === '开屏' && selectedAssetInfo.showMask && (
              <div className="absolute inset-x-0 text-center pointer-events-none z-[60]"
                style={{ bottom: (selectedAsset.id.includes('mt-s-5') || selectedAsset.id.includes('mt-s-6') || selectedAsset.templateName.includes('非全屏')) ? 'calc(26.07% - 5px)' : (selectedAsset.templateName.includes('上下滑动') ? 'calc(12.18% - 5px)' : (selectedAsset.templateName === '扭动全屏' ? '12.48%' : '8.97%')), transform: selectedAsset.id.includes('mt-s-2') ? 'translateY(-2px)' : (selectedAsset.id.includes('mt-s-1') || selectedAsset.id.includes('mt-s-3')) ? 'translateY(2px)' : 'none' }}>
                <div className="inline-block" style={{ fontSize: ((selectedAsset.id.includes('mt-s-5') || selectedAsset.id.includes('mt-s-6') || selectedAsset.templateName.includes('非全屏')) || selectedAsset.templateName.includes('上下滑动')) ? '2.48cqh' : (selectedAsset.templateName === '扭动全屏' ? '1.54cqh' : '1.79cqh'), letterSpacing: '0.05em' }}>
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
            {(selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-3') || selectedAsset.id.includes('mt-ib-4') || selectedAsset.category === '弹窗' || selectedAsset.id.includes('mt-fe-1')) && !selectedAsset.type.startsWith('video') && (
              <div
                className={`absolute ${(selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-ib-4')) ? 'z-[40]' : (selectedAsset.category === '弹窗' ? 'z-[50]' : (selectedAsset.id.includes('mt-fe-1') ? 'z-[40]' : 'z-10'))}`}
                style={{
                  ...(selectedAssetInfo.showMask ? (
                    selectedAsset.id.includes('mt-ib-1') ? { width: '25.57%', height: '15.76%', left: '62.87%', top: '73.02%' } :
                      selectedAsset.id.includes('mt-ib-2') ? { width: '13.86%', height: '6.40%', left: '14.92%', top: '53.08%' } :
                        selectedAsset.id.includes('mt-p-1') ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '20.44%' } :
                          (selectedAsset.id.includes('mt-p-2') || selectedAsset.id.includes('mt-p-3')) ? { width: '85.26%', height: '39.41%', left: '7.37%', top: '30.30%' } :
                            selectedAsset.id.includes('mt-ib-4') ? { width: '91.47%', height: '11.82%', left: '4.27%', top: '40.23%' } :
                              selectedAsset.id.includes('mt-fe-1') ? { width: '44.968%', height: '27.717%', left: '4.085%', top: '61.124%' } :
                                { width: '100%', height: '26.27%', left: 0, top: 0 }
                  ) : { inset: 0 }),
                  containerType: 'size'
                }}
              >
                <img src={selectedAsset.url} alt={selectedAsset.name} className={`w-full h-full ${selectedAssetInfo.showMask ? (selectedAsset.id.includes('mt-ib-4') ? 'object-cover rounded-[5px]' : (selectedAsset.id.includes('mt-p-1') ? 'object-cover rounded-[10px]' : (selectedAsset.id.includes('mt-fe-1') ? 'object-cover rounded-[10px]' : (selectedAsset.id.includes('mt-ib-1') || selectedAsset.id.includes('mt-ib-2') || selectedAsset.id.includes('mt-p-2') || selectedAsset.id.includes('mt-p-3')) ? 'object-contain rounded-[10px]' : 'object-cover'))) : 'object-contain'}`} />
              </div>
            )}

            {/* Modal: Score Popup Text (mt-p-1) Top Layer */}
            {selectedAsset.id.includes('mt-p-1') && selectedAsset.splashText && (
              <div
                className="absolute pointer-events-none z-[75]"
                style={{
                  ...(selectedAssetInfo.showMask ? (selectedAsset.id.includes('mt-p-1') ? { width: '85.26%', height: '59.11%', left: '7.37%', top: '20.44%' } : { width: '85.26%', height: '39.41%', left: '7.37%', top: '30.30%' }) : { inset: 0 }),
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
