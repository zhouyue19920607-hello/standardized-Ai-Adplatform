
import React, { useState } from 'react';
import { AdAsset, AdConfig } from '../types';

interface PreviewGridProps {
  assets: AdAsset[];
  config: AdConfig;
  onClear: () => void;
  onToggleMask: () => void;
  isGenerating?: boolean;
}

const AdCard: React.FC<{ asset: AdAsset; globalShowMask: boolean; config: AdConfig }> = ({ asset, globalShowMask, config }) => {
  const [localShowMask, setLocalShowMask] = useState(globalShowMask);
  const [isEditingText, setIsEditingText] = useState(false);
  const [localSplashText, setLocalSplashText] = useState(asset.splashText || '跳转至第三方平台');

  React.useEffect(() => {
    setLocalShowMask(globalShowMask);
  }, [globalShowMask]);

  const handleDownload = (type: 'original' | 'masked') => {
    const link = document.createElement('a');
    link.href = asset.url; 
    link.download = `${type === 'original' ? 'orig' : 'masked'}_${asset.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group">
      <div className="aspect-[16/9] relative bg-slate-100 overflow-hidden">
        <img 
          alt={asset.name} 
          className="w-full h-full object-cover" 
          src={asset.url}
        />
        
        {/* Dynamic Overlay Layer - MR Mask */}
        {(asset.category === '焦点视窗' || asset.category === '开屏') && localShowMask && (
          <div 
            className="absolute inset-y-0 left-0 w-1/2 flex items-center px-6 transition-all duration-300"
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
        )}

        {/* Custom Text for Splash Templates - Only visible when Mask is ON, and No Background Container */}
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
      </div>
      
      <div className="p-4 space-y-4">
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
               核心资产就绪
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => handleDownload('original')}
                className="p-1.5 text-slate-500 hover:text-primary hover:bg-blue-50 rounded-md transition-colors"
                title="保存原图"
              >
                <span className="material-symbols-outlined text-sm">download</span>
              </button>
              <button 
                onClick={() => handleDownload('masked')}
                className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                title="保存MR遮罩图"
              >
                <span className="material-symbols-outlined text-sm">grid_view</span>
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
            <AdCard key={asset.id} asset={asset} globalShowMask={config.showMask} config={config} />
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
    </section>
  );
};

export default PreviewGrid;
