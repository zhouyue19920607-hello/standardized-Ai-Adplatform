import React, { useState } from 'react';
import { AdAsset, AdConfig } from '../types';
import { getTemplates, ASSETS_URL } from '../services/api';
import { getDerivedGradientColor } from '../utils/colorUtils';

interface PreviewGridProps {
  assets: AdAsset[];
  config: AdConfig;
  onClear: () => void;
  onToggleMask: () => void;
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
  onZoom: (asset: AdAsset) => void;
}> = ({ asset, globalShowMask, config, onZoom }) => {
  const [localShowMask, setLocalShowMask] = useState(globalShowMask);
  const [isEditingText, setIsEditingText] = useState(false);
  const [localSplashText, setLocalSplashText] = useState(asset.splashText || '跳转至第三方平台');
  const aspectRatio = parseAspectRatio(asset.dimensions);

  React.useEffect(() => {
    setLocalShowMask(globalShowMask);
  }, [globalShowMask]);

  const handleDownload = async () => {
    if (!localShowMask) {
      // 不带遮罩：直接下载原图
      const link = document.createElement('a');
      link.href = asset.url;
      link.download = `original_${asset.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // 带遮罩：实现 Canvas 合成 (仅针对美图秀秀焦点视窗)
    if (asset.app === '美图秀秀' && asset.category === '焦点视窗') {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 设置画布尺寸为原始图片尺寸
        const loadImg = (src: string): Promise<HTMLImageElement> => {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
          });
        };

        const [mainImg, bg1, bg2, iconMask, gradMask] = await Promise.all([
          loadImg(asset.url),
          loadImg('/focal-window/fixed_bg_1.png'),
          loadImg('/focal-window/fixed_bg_2.png'),
          loadImg('/focal-window/icon_bg.png'),
          loadImg('/focal-window/gradient_layer.png')
        ]);

        canvas.width = mainImg.naturalWidth;
        canvas.height = mainImg.naturalHeight;

        // 1. 绘制底层用户素材
        ctx.drawImage(mainImg, 0, 0, canvas.width, canvas.height);

        // 获取当前应有的颜色
        const baseColor = (config.smartExtract && asset.aiExtractedColor) ? asset.aiExtractedColor : config.iconColor;
        const derivedColor = getDerivedGradientColor(baseColor);

        // 2. 绘制 fixed_bg_2 (内底) - z-10
        ctx.drawImage(bg2, 0, 0, canvas.width, canvas.height);

        // 3. 绘制 gradient_layer (变色渐变层) - z-20
        const gradCanvas = document.createElement('canvas');
        gradCanvas.width = canvas.width;
        gradCanvas.height = canvas.height;
        const gradCtx = gradCanvas.getContext('2d')!;

        // 填充颜色
        gradCtx.fillStyle = derivedColor;
        gradCtx.fillRect(0, 0, canvas.width, canvas.height);

        // 处理黑白图为 Alpha 遮罩 (Luminance to Alpha)
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvas.width;
        maskCanvas.height = canvas.height;
        const maskCtx = maskCanvas.getContext('2d')!;
        maskCtx.drawImage(gradMask, 0, 0, canvas.width, canvas.height);
        const maskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < maskData.data.length; i += 4) {
          // 标准 Luminance 逻辑：白色(255)->Alpha(255), 黑色(0)->Alpha(0)
          // 这样 PNG 里的黑条部分就会变成“窗口”透明，白区变色。
          const avg = (maskData.data[i] + maskData.data[i + 1] + maskData.data[i + 2]) / 3;
          maskData.data[i + 3] = avg;
        }
        maskCtx.putImageData(maskData, 0, 0);

        gradCtx.globalCompositeOperation = 'destination-in';
        gradCtx.drawImage(maskCanvas, 0, 0);

        // 添加垂直 0-20-80-100 羽化 (用户指定逻辑)
        const verticalGrad = gradCtx.createLinearGradient(0, 0, 0, canvas.height);
        verticalGrad.addColorStop(0, 'rgba(0,0,0,0)');
        verticalGrad.addColorStop(0.2, 'rgba(0,0,0,1)');
        verticalGrad.addColorStop(0.8, 'rgba(0,0,0,1)');
        verticalGrad.addColorStop(1, 'rgba(0,0,0,0)');
        gradCtx.globalCompositeOperation = 'destination-in';
        gradCtx.fillStyle = verticalGrad;
        gradCtx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(gradCanvas, 0, 0);

        // 4. 绘制 icon_bg (图标底 - 变色) - z-30
        const iconCanvas = document.createElement('canvas');
        iconCanvas.width = canvas.width;
        iconCanvas.height = canvas.height;
        const iconCtx = iconCanvas.getContext('2d')!;
        iconCtx.fillStyle = baseColor;
        iconCtx.fillRect(0, 0, canvas.width, canvas.height);
        iconCtx.globalCompositeOperation = 'destination-in';
        iconCtx.drawImage(iconMask, 0, 0, canvas.width, canvas.height);
        ctx.drawImage(iconCanvas, 0, 0);

        // 5. 绘制 fixed_bg_1 (最顶层) - z-40
        ctx.drawImage(bg1, 0, 0, canvas.width, canvas.height);

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `composite_${asset.name}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error("Canvas composite failed:", err);
        // 回退逻辑：如果合成失败，下载原图
        const link = document.createElement('a');
        link.href = asset.url;
        link.download = `download_fallback_${asset.name}`;
        link.click();
      }
    } else {
      // 其他模版直接下载
      const link = document.createElement('a');
      link.href = asset.url;
      link.download = `${localShowMask ? 'preview' : 'original'}_${asset.name}`;
      link.click();
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group flex flex-col h-full">
      <div
        className="relative bg-slate-100 overflow-hidden cursor-zoom-in w-full"
        style={{ aspectRatio }}
        onDoubleClick={() => onZoom(asset)}
      >
        <img
          alt={asset.name}
          className="w-full h-full object-cover"
          src={asset.url}
        />

        {/* Dynamic Overlay Layer - MR Mask or Focal Window Layers */}
        {localShowMask && (
          <div className="absolute inset-0 transition-opacity duration-300 pointer-events-none">
            {asset.app === '美图秀秀' && asset.category === '焦点视窗' ? (() => {
              const baseColor = (config.smartExtract && asset.aiExtractedColor) ? asset.aiExtractedColor : config.iconColor;
              const derivedGradientColor = getDerivedGradientColor(baseColor);

              return (
                <div className="absolute inset-0">
                  {/* 最顶层 (z-40) */}
                  <div className="absolute inset-0 z-[40]">
                    <img src="/focal-window/fixed_bg_1.png" className="w-full h-full object-fill" alt="top" />
                  </div>

                  {/* 第三层：图标底 (z-30) */}
                  <div
                    className="absolute inset-0 z-[30]"
                    style={{
                      maskImage: 'url(/focal-window/icon_bg.png)',
                      WebkitMaskImage: 'url(/focal-window/icon_bg.png)',
                      maskSize: '100% 100%',
                      WebkitMaskSize: '100% 100%',
                      backgroundColor: baseColor,
                    }}
                  />

                  {/* 第二层：变色渐变层 (z-20) */}
                  <div
                    className="absolute inset-0 z-[20]"
                    style={{
                      // 复合遮罩：垂直渐变边缘 + PNG 形状
                      // Luminance 模式下：黑位(PNG中间)透明 -> 形成窗口；白位(上下)显示颜色
                      maskImage: `linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%), url(/focal-window/gradient_layer.png)`,
                      WebkitMaskImage: `linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%), url(/focal-window/gradient_layer.png)`,
                      maskSize: '100% 100%',
                      WebkitMaskSize: '100% 100%',
                      maskMode: 'luminance',
                      WebkitMaskMode: 'luminance',
                      backgroundColor: derivedGradientColor,
                      // 如果用户依然感觉没拾取色值，强制在这里使用拾取到的色值展示
                      boxShadow: '0 0 0 transparent'
                    }}
                  />

                  {/* 内底层 (z-10) */}
                  <div className="absolute inset-0 z-[10]">
                    <img src="/focal-window/fixed_bg_2.png" className="w-full h-full object-fill" alt="base" />
                  </div>
                </div>
              );
            })() : (asset.category === '焦点视窗' || asset.category === '开屏') ? (
              asset.maskUrl ? (
                <img
                  src={`${ASSETS_URL}${asset.maskUrl}`}
                  className="w-full h-full object-contain"
                  alt="mask overlay"
                />
              ) : (
                <div
                  className="absolute inset-0 flex items-center px-6"
                  style={{
                    background: `linear-gradient(to right, ${config.smartExtract ? asset.aiExtractedColor : config.gradientColor} 0%, transparent 100%)`,
                    opacity: 0.85
                  }}
                >
                  <div className="w-12 h-12 bg-white rounded-lg shadow-lg flex items-center justify-center animate-in fade-in zoom-in duration-300">
                    <span
                      className="material-symbols-outlined text-2xl fill"
                      style={{ color: config.smartExtract ? asset.aiExtractedColor : config.iconColor }}
                    >
                      {config.smartExtract ? asset.suggestedIcon : 'star'}
                    </span>
                  </div>
                </div>
              )
            ) : null}
          </div>
        )}

        {/* Custom Text for Splash Templates */}
        {asset.category === '开屏' && localShowMask && (
          <div className="absolute bottom-10 left-0 w-full flex justify-center px-4 pointer-events-none">
            <div
              className={`transition-all duration-300 flex items-center gap-2 pointer-events-auto ${isEditingText ? 'ring-2 ring-primary bg-white/20 rounded p-1' : ''}`}
              style={{ fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' }}
            >
              {isEditingText ? (
                <input
                  autoFocus
                  className="bg-transparent border-none text-white text-[14px] font-bold tracking-wider focus:ring-0 p-0 text-center w-48 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                  value={localSplashText}
                  onChange={(e) => setLocalSplashText(e.target.value)}
                  onBlur={() => setIsEditingText(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsEditingText(false)}
                />
              ) : (
                <span className="text-white text-[14px] font-bold tracking-wider drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                  {localSplashText}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <span className="bg-slate-900/80 text-[10px] text-white px-2 py-0.5 rounded backdrop-blur-md font-black uppercase shadow-lg">
              {asset.app}
            </span>
            <span className="bg-primary text-[10px] text-white px-2 py-0.5 rounded backdrop-blur-md font-bold uppercase shadow-lg">
              {asset.category}
            </span>
          </div>
        </div>
        <div className="absolute bottom-3 right-3">
          <span className="bg-white/90 text-[10px] text-slate-900 px-2 py-0.5 rounded border border-slate-200 font-bold shadow-sm">
            {asset.dimensions}
          </span>
        </div>

        {/* Hint for zoom */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
          <span className="material-symbols-outlined text-white opacity-0 group-hover:opacity-100 transition-opacity text-3xl">zoom_in</span>
        </div>
      </div>

      <div className="p-4 space-y-4 mt-auto">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-800 truncate max-w-[120px]">{asset.templateName}</span>
                <span className="text-[10px] text-slate-400 font-medium px-1.5 border border-slate-200 rounded">{asset.size}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-100">
              {asset.category === '开屏' && localShowMask && (
                <button
                  onClick={() => setIsEditingText(!isEditingText)}
                  className={`text-[10px] font-bold px-2 py-1 rounded transition-all flex items-center gap-1 border-r border-slate-200 ${isEditingText ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-primary'}`}
                >
                  <span className="material-symbols-outlined text-xs">edit_note</span>
                  文案
                </button>
              )}
              <button
                onClick={() => setLocalShowMask(!localShowMask)}
                className={`text-[10px] font-bold px-2 py-1 rounded transition-all flex items-center gap-1 ${localShowMask ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-primary'}`}
              >
                <span className="material-symbols-outlined text-xs">{localShowMask ? 'visibility' : 'visibility_off'}</span>
                MR遮罩
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-50">
            <div className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              {localShowMask ? '预览就绪 (带遮罩)' : '基础资产就绪'}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleDownload()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
                title={localShowMask ? "下载点亮遮罩后的成果" : "下载原图成果"}
              >
                <span className="material-symbols-outlined text-xs">download</span>
                {localShowMask ? '下载复合成果' : '下载原图'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PreviewGrid: React.FC<PreviewGridProps> = ({
  assets,
  config,
  onClear,
  onToggleMask,
  isGenerating
}) => {
  const [selectedAsset, setSelectedAsset] = useState<AdAsset | null>(null);

  return (
    <section className="flex-1 p-6 pt-6 overflow-y-auto custom-scrollbar bg-slate-50/50">
      <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-xl border border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-6">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 border-r border-slate-200 pr-6">
            生成结果预览
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-700">全局显示MR遮罩</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={config.showMask}
                onChange={onToggleMask}
              />
              <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
        <div className="flex gap-2">
          {assets.length > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-red-500 font-medium px-3 py-1.5 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">delete</span> 清空全部预览
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-12">
        {isGenerating ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm animate-pulse">
              <div className="aspect-[16/9] bg-slate-200"></div>
              <div className="p-4 space-y-3">
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                <div className="h-3 bg-slate-200 rounded w-1/4"></div>
              </div>
            </div>
          ))
        ) : assets.length > 0 ? (
          assets.map(asset => (
            <AdCard
              key={asset.id}
              asset={asset}
              globalShowMask={config.showMask}
              config={config}
              onZoom={(a) => setSelectedAsset(a)}
            />
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-24 text-slate-400">
            <div className="bg-white p-6 rounded-full border-2 border-dashed border-slate-200 mb-4 opacity-40">
              <span className="material-symbols-outlined text-6xl">model_training</span>
            </div>
            <p className="text-sm font-medium">暂无已生成的预览资产</p>
            <p className="text-xs opacity-60 mt-1">请上传素材并勾选左侧模版后，点击“执行生成”</p>
          </div>
        )}
      </div>

      {/* Zoom Modal */}
      {selectedAsset && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-200"
          onClick={() => setSelectedAsset(null)}
        >
          <button
            className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors"
            onClick={() => setSelectedAsset(null)}
          >
            <span className="material-symbols-outlined text-4xl">close</span>
          </button>

          <div
            className="relative max-w-full max-h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedAsset.url}
              alt="zoomed result"
              className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-lg"
            />

            {/* Overlay PNG Mask in Modal */}
            {config.showMask && selectedAsset.maskUrl && (
              <img
                src={`${ASSETS_URL}${selectedAsset.maskUrl}`}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none rounded-lg"
                alt="mask overlay zoomed"
              />
            )}

            {/* Overlay CSS Mask in Modal if no PNG */}
            {config.showMask && !selectedAsset.maskUrl && (selectedAsset.category === '焦点视窗' || selectedAsset.category === '开屏') && (
              <div
                className="absolute inset-y-0 left-0 w-1/2 flex items-center px-12 pointer-events-none rounded-l-lg"
                style={{
                  background: `linear-gradient(to right, ${config.smartExtract ? selectedAsset.aiExtractedColor : config.gradientColor} 0%, transparent 100%)`,
                  opacity: 0.85
                }}
              >
                <div className="w-24 h-24 bg-white rounded-2xl shadow-2xl flex items-center justify-center">
                  <span
                    className="material-symbols-outlined text-5xl fill"
                    style={{ color: config.smartExtract ? selectedAsset.aiExtractedColor : config.iconColor }}
                  >
                    {config.smartExtract ? selectedAsset.suggestedIcon : 'star'}
                  </span>
                </div>
              </div>
            )}

            <div className="absolute -bottom-16 left-0 w-full flex justify-between items-center px-2">
              <div className="text-white">
                <h3 className="text-lg font-bold">{selectedAsset.templateName}</h3>
                <p className="text-sm text-white/60">{selectedAsset.app} · {selectedAsset.category} · {selectedAsset.dimensions}</p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = selectedAsset.url;
                    link.download = `preview_${selectedAsset.name}`;
                    link.click();
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl font-bold transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  保存图片
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default PreviewGrid;
