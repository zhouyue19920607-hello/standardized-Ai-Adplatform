import React, { useState, useEffect } from 'react';
import { AdTemplate, AdConfig } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface SidebarProps {
  templates: AdTemplate[];
  config: AdConfig;
  onTemplateToggle: (id: string) => void;
  onConfigChange: (newConfig: Partial<AdConfig>) => void;
  activeCount: number;
  onGenerate: () => void;
  isProcessing: boolean;
  generationProgress?: { current: number; total: number } | null;
  onTemplateUpdate: (id: string, updates: Partial<AdTemplate>) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  templates,
  config,
  onTemplateToggle,
  onConfigChange,
  activeCount,
  onGenerate,
  isProcessing,
  generationProgress,
  onTemplateUpdate
}) => {
  const { t } = useLanguage();
  if (!Array.isArray(templates)) return null;
  const apps: AdTemplate['app'][] = ['美图秀秀', '美颜', 'wink'];

  // NOTE: 三平台开屏 — 仅取美图秀秀的开屏模板作为代表，生成时自动关联三平台蒙版
  const meituSplashTemplates = templates.filter(tpl => tpl.app === '美图秀秀' && tpl.category === '开屏' && tpl.splashGroup !== 'bubble');

  // State for collapsible sub-categories (Key format: "AppName-CategoryName")
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  // Helper to toggle expansion
  const toggleCat = (key: string) => {
    setExpandedCats(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const initialExpanded: Record<string, boolean> = {};
    templates.forEach(tpl => {
      const key = `${tpl.app}-${tpl.category}`;
      if (initialExpanded[key] === undefined) initialExpanded[key] = false;
    });
    setExpandedCats(prev => ({ ...initialExpanded, ...prev }));
  }, [templates.length]);

  return (
    <aside className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 shrink-0 flex items-center">
        <p className="text-sm text-slate-900 font-bold">{t('sidebar.selectCat')}</p>
      </div>

      <div className="flex-1 min-h-0 p-3 space-y-6 overflow-y-auto custom-scrollbar pb-32">

        {/* ===== 三平台开屏模版（以秀秀为代表，去重显示，生成时自动带三平台蒙版）===== */}
        {meituSplashTemplates.length > 0 && (() => {
          const expandKey = 'splash-unified';
          const isExpanded = expandedCats[expandKey] ?? false;
          const selectedCount = meituSplashTemplates.filter(tpl => tpl.checked).length;
          const isAllSelected = meituSplashTemplates.every(tpl => tpl.checked);
          return (
            <div className="space-y-2 group">
              <div className="flex flex-col border-b border-ios-gray-6 pb-2 last:border-0">
                {/* Category header row */}
                <div
                  className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-white/20 transition-colors select-none rounded-xl"
                  onClick={() => toggleCat(expandKey)}
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className={`material-symbols-outlined text-[18px] text-slate-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>chevron_right</span>
                    <div className="flex items-center gap-[3px] shrink-0">
                      <img src="/icons/meitu_mask_icon.png" className="w-[18px] h-[18px] rounded-[4px] object-contain" alt="meitu" />
                      <img src="/icons/beauty_mask_icon.png" className="w-[18px] h-[18px] rounded-[4px] object-contain" alt="beauty" />
                      <img src="/icons/wink_mask_icon.png" className="w-[18px] h-[18px] rounded-[4px] object-contain" alt="wink" />
                    </div>
                    <span className="text-[15px] font-bold text-slate-800 ml-0.5 truncate">开屏</span>
                    <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0">{meituSplashTemplates.length}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedCount > 0 && (
                      <span className="text-[10px] bg-primary text-white px-2 py-0.5 rounded-full font-bold">{selectedCount}</span>
                    )}
                    <div
                      className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        const targetState = !isAllSelected;
                        meituSplashTemplates.forEach(tpl => { if (tpl.checked !== targetState) onTemplateToggle(tpl.id); });
                      }}
                    >
                      {isAllSelected ? (
                        <span className="material-symbols-outlined text-sm text-primary fill">check_circle</span>
                      ) : (
                        <span className="material-symbols-outlined text-sm text-ios-gray-3">radio_button_unchecked</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Template list */}
                {isExpanded && (
                  <div className="bg-ios-gray-6/30 p-1.5 space-y-1 rounded-xl mx-2">
                    {meituSplashTemplates.map(tpl => (
                      <div key={tpl.id} className="px-1 relative group/template">
                        <label
                          className={`flex items-center gap-3 p-3 rounded-2xl transition-all cursor-pointer shadow-sm lens-effect ${tpl.checked ? 'bg-white/80 ring-1 ring-primary/20' : 'bg-white/30 hover:bg-white/50'}`}
                        >
                          <div className="flex items-center justify-center">
                            {tpl.checked ? (
                              <span className="material-symbols-outlined text-[22px] text-primary fill">check_circle</span>
                            ) : (
                              <span className="material-symbols-outlined text-[22px] text-ios-gray-4">radio_button_unchecked</span>
                            )}
                            <input type="checkbox" checked={tpl.checked} onChange={() => onTemplateToggle(tpl.id)} className="sr-only" />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-sm font-semibold truncate ${tpl.checked ? 'text-primary' : 'text-slate-800'}`}>
                                {t(`templates.${tpl.name}`) !== `templates.${tpl.name}` ? t(`templates.${tpl.name}`) : tpl.name}
                              </span>
                              {/* NOTE: 三平台徽章提示 */}
                              <span className="text-[9px] text-blue-400 font-bold bg-blue-50 px-1.5 py-0.5 rounded-full shrink-0">×3平台</span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[10px] text-slate-500 font-bold font-mono tracking-tight">{tpl.dimensions}</span>
                              <span className="text-[10px] text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 font-medium">
                                <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>photo_library</span>
                                {tpl.processedCount || 0}
                              </span>
                            </div>
                          </div>
                        </label>
                        <div className="pointer-events-none absolute left-3 right-3 top-[calc(100%-2px)] z-50 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold leading-relaxed text-slate-600 shadow-xl opacity-0 translate-y-1 group-hover/template:opacity-100 group-hover/template:translate-y-0 transition-all duration-100">
                          支持图片或视频素材；可用 AI 扩图适配尺寸；视频自动压缩至 3MB 以内。
                        </div>

                        {/* NOTE: 开屏模版截帧配置 */}
                        {tpl.checked && (
                          <div className="my-2 p-3 bg-white/50 rounded-ios border border-black/5 space-y-3 shadow-ios">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('sidebar.personalized')}</span>
                              <span className="material-symbols-outlined text-ios-gray-3 text-xs">settings_suggest</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-ios-gray-1">截取第1帧</span>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="sr-only peer"
                                  checked={config.captureFirstFrame}
                                  onChange={(e) => onConfigChange({
                                    captureFirstFrame: e.target.checked,
                                    ...(e.target.checked ? { captureLastFrameSplash: false } : {})
                                  })}
                                />
                                <div className="w-9 h-5 bg-ios-gray-4 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ios-gray-3 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                              </label>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-ios-gray-1">截取最后1帧</span>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="sr-only peer"
                                  checked={config.captureLastFrameSplash ?? false}
                                  onChange={(e) => onConfigChange({
                                    captureLastFrameSplash: e.target.checked,
                                    ...(e.target.checked ? { captureFirstFrame: false } : {})
                                  })}
                                />
                                <div className="w-9 h-5 bg-ios-gray-4 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ios-gray-3 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ===== 各 App 其他分类（开屏已移至上方三平台分组，不再重复显示）===== */}
        {apps.map(appName => {
          const appTemplates = templates.filter(tpl => {
            if (tpl.id === 'mt-f-2') return false;
            if (appName === '美颜') {
              // NOTE: 美颜平台目前仅开放静态/动态焦点视窗模版 (my-f-1, my-f-2)
              return tpl.app === '美颜' && (tpl.id === 'my-f-1' || tpl.id === 'my-f-2');
            }
            return tpl.app === appName;
          });

          // NOTE: 排除开屏模版，已并入三平台开屏统一分组
          const categories = Array.from(new Set(
            appTemplates.filter(tpl => tpl.category !== '开屏').map(tpl => tpl.category)
          ));

          // 美颜没有其他非开屏模版时，显示占位
          if (categories.length === 0) {
            const iconMap: Record<string, string> = { '美图秀秀': 'meitu', '美颜': 'beauty', 'wink': 'wink' };
            const iconName = iconMap[appName] || appName;
            return null;
          }

          const iconMap: Record<string, string> = { '美图秀秀': 'meitu', '美颜': 'beauty', 'wink': 'wink' };
          const iconName = iconMap[appName] || appName;
          return (
            <div key={appName} className="space-y-2 group">
              {/* App Header */}
              <div className="flex items-center gap-1.5 px-3">
                <img src={`/icons/${iconName}_mask_icon.png`} className="w-[14px] h-[14px] rounded-[3px] object-contain shrink-0" alt={appName} />
                <h3 className="text-xs font-bold text-slate-800">{t(`apps.${appName}`)}</h3>
              </div>

              <div className={`transition-all`}>
                <div className="flex flex-col">
                    {categories.map(cat => {
                      const subTemplates = appTemplates.filter(tpl => tpl.category === cat);
                      const expandKey = `${appName}-${cat}`;
                      const isExpanded = expandedCats[expandKey] ?? false;
                      const selectedCount = subTemplates.filter(tpl => tpl.checked).length;
                      const isAllSelected = subTemplates.length > 0 && subTemplates.every(tpl => tpl.checked);

                      return (
                        <div key={cat} className="border-b border-ios-gray-6 last:border-0">
                          {/* Category Header */}
                          <div
                            className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-white/20 transition-colors select-none rounded-xl"
                            onClick={() => toggleCat(expandKey)}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>chevron_right</span>
                              <span className="text-[15px] font-bold text-slate-800">{t(`categories.${cat}`)}</span>
                              <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded-full">{subTemplates.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {selectedCount > 0 && (
                                <span className="text-[10px] bg-primary text-white px-2 py-0.5 rounded-full font-bold">{selectedCount}</span>
                              )}
                              {/* Select All Checkbox for Category */}
                              <div
                                className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const targetState = !isAllSelected;
                                  subTemplates.forEach(tpl => {
                                    if (tpl.checked !== targetState) onTemplateToggle(tpl.id);
                                  });
                                }}
                              >
                                {isAllSelected ? (
                                  <span className="material-symbols-outlined text-sm text-primary fill">check_circle</span>
                                ) : (
                                  <span className="material-symbols-outlined text-sm text-ios-gray-3">radio_button_unchecked</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Templates List (Collapsible) */}
                          {isExpanded && (
                            <div className="bg-ios-gray-6/30 p-1.5 space-y-1">
                              {subTemplates.map(tpl => (
                                <div key={tpl.id} className="px-1 relative group/template">
                                  <label
                                    title={tpl.name === '动态开屏' ? t('sidebar.cardPreviewOnly') : undefined}
                                    className={`flex items-center gap-3 p-3 rounded-2xl transition-all cursor-pointer shadow-sm lens-effect
                                                            ${tpl.checked ? 'bg-white/80 ring-1 ring-primary/20' : 'bg-white/30 hover:bg-white/50'}`
                                    }
                                  >
                                    <div className="flex items-center justify-center">
                                      {tpl.checked ? (
                                        <span className="material-symbols-outlined text-[22px] text-primary fill">check_circle</span>
                                      ) : (
                                        <span className="material-symbols-outlined text-[22px] text-ios-gray-4">radio_button_unchecked</span>
                                      )}
                                      <input
                                        type="checkbox"
                                        checked={tpl.checked}
                                        onChange={() => onTemplateToggle(tpl.id)}
                                        className="sr-only"
                                      />
                                    </div>
                                    <div className="flex flex-col flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className={`text-sm font-semibold truncate ${tpl.checked ? 'text-primary' : 'text-slate-800'}`}>
                                          {t(`templates.${tpl.name}`) !== `templates.${tpl.name}` ? t(`templates.${tpl.name}`) : tpl.name}
                                        </span>
                                        {tpl.mask_path && <span className="material-symbols-outlined text-[14px] text-slate-400" title="支持MR遮罩">visibility</span>}
                                      </div>
                                      <div className="flex items-center justify-between mt-0.5">
                                        <span className="text-[10px] text-slate-500 font-bold font-mono tracking-tight">{tpl.dimensions}</span>
                                        <span className="text-[10px] text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 font-medium" title="累积处理图片数">
                                          <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>photo_library</span>
                                          {tpl.processedCount || 0}
                                        </span>
                                      </div>
                                    </div>
                                  </label>
                                  {tpl.id === 'mt-f-1' && (
                                    <div className="pointer-events-none absolute left-3 right-3 top-[calc(100%-2px)] z-50 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold leading-relaxed text-slate-600 shadow-xl opacity-0 translate-y-1 group-hover/template:opacity-100 group-hover/template:translate-y-0 transition-all duration-100">
                                      支持图片或视频素材；可智能配色，也可用 AI 扩图适配尺寸；视频自动压缩至 10MB 以内。
                                    </div>
                                  )}

                                  {/* Config Panel (Inline) - Focal Window or Dynamic Splash */}
                                  {tpl.checked && tpl.app !== 'wink' && (tpl.category === '焦点视窗' || (tpl.category === '开屏' && tpl.name.includes('动态'))) && (
                                    <div className="my-2 p-3 bg-white/50 rounded-ios border border-black/5 space-y-3 shadow-ios">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('sidebar.personalized')}</span>
                                        <span className="material-symbols-outlined text-ios-gray-3 text-xs">settings_suggest</span>
                                      </div>

                                      {/* Specific option for Dynamic Splash */}
                                      {tpl.category === '开屏' && tpl.name.includes('动态') && (
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-bold text-ios-gray-1">{t('sidebar.captureFirst')}</span>
                                          <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                              type="checkbox"
                                              className="sr-only peer"
                                              checked={config.captureFirstFrame}
                                              onChange={(e) => onConfigChange({ captureFirstFrame: e.target.checked })}
                                            />
                                            <div className="w-9 h-5 bg-ios-gray-4 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ios-gray-3 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                          </label>
                                        </div>
                                      )}

                                      {/* Focal Window Options */}
                                      {tpl.category === '焦点视窗' && tpl.app !== 'wink' && (
                                        <>
                                          {/* NOTE: mt-f-1 动态焦点视窗专属：截取视频第0帧 */}
                                          {tpl.id === 'mt-f-1' && (
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs font-bold text-ios-gray-1">截取第0帧</span>
                                              <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  className="sr-only peer"
                                                  checked={config.captureFirstFrameMtF1 ?? false}
                                                  onChange={(e) => onConfigChange({
                                                    captureFirstFrameMtF1: e.target.checked,
                                                    ...(e.target.checked ? { captureLastFrameMtF1: false } : {})
                                                  })}
                                                />
                                                <div className="w-9 h-5 bg-ios-gray-4 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ios-gray-3 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                              </label>
                                            </div>
                                          )}
                                          {/* NOTE: mt-f-1 动态焦点视窗专属：截取视频最后一帧 */}
                                          {tpl.id === 'mt-f-1' && (
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs font-bold text-ios-gray-1">截取最后一帧</span>
                                              <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  className="sr-only peer"
                                                  checked={config.captureLastFrameMtF1}
                                                  onChange={(e) => onConfigChange({
                                                    captureLastFrameMtF1: e.target.checked,
                                                    ...(e.target.checked ? { captureFirstFrameMtF1: false } : {})
                                                  })}
                                                />
                                                <div className="w-9 h-5 bg-ios-gray-4 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ios-gray-3 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                              </label>
                                            </div>
                                          )}
                                          {/* NOTE: my-f-1 美颜动态焦点视窗专属：截取视频第一帧 */}
                                          {tpl.id === 'my-f-1' && (
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs font-bold text-ios-gray-1">截取第一帧</span>
                                              <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  className="sr-only peer"
                                                  checked={config.captureFirstFrameMyF1 ?? false}
                                                  onChange={(e) => onConfigChange({ captureFirstFrameMyF1: e.target.checked })}
                                                />
                                                <div className="w-9 h-5 bg-ios-gray-4 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ios-gray-3 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                              </label>
                                            </div>
                                          )}
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-ios-gray-1">{t('sidebar.smartExtract')}</span>
                                            <div className="flex items-center gap-2 shrink-0">
                                              {(tpl.smartExtract !== false) && tpl.palette && tpl.palette.length > 1 && (
                                                <button
                                                  onClick={() => {
                                                    const currentIdx = tpl.palette?.findIndex(p => p.iconColor === tpl.iconColor) ?? -1;
                                                    const nextIndex = (currentIdx + 1) % (tpl.palette?.length || 1);
                                                    const nextScheme = tpl.palette?.[nextIndex];
                                                    if (nextScheme) {
                                                      onTemplateUpdate(tpl.id, {
                                                        iconColor: nextScheme.iconColor,
                                                        gradientColor: nextScheme.gradientColor
                                                      });
                                                    }
                                                  }}
                                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all border border-primary/20 active:scale-95"
                                                  title="随机更换配色"
                                                >
                                                  <span className="material-symbols-outlined text-[18px]">casino</span>
                                                </button>
                                              )}
                                              <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  className="sr-only peer"
                                                  checked={tpl.smartExtract ?? true}
                                                  onChange={(e) => onTemplateUpdate(tpl.id, { smartExtract: e.target.checked })}
                                                />
                                                <div className="w-9 h-5 bg-ios-gray-4 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ios-gray-3 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                              </label>
                                            </div>
                                          </div>

                                          {/* NOTE: 智能取色开启时，只读展示当前提取到的色值 */}
                                          {(tpl.smartExtract ?? true) && (tpl.iconColor || tpl.gradientColor) && (
                                            <div className="flex items-center gap-3 pt-1">
                                              {tpl.iconColor && /^#[0-9A-Fa-f]{6}$/.test(tpl.iconColor) && (
                                                <div className="flex items-center gap-1.5">
                                                  <div className="w-3.5 h-3.5 rounded-full border border-ios-gray-5 ring-1 ring-white shrink-0" style={{ backgroundColor: tpl.iconColor }} title="主色" />
                                                  <span className="text-[10px] font-mono text-ios-gray-2 uppercase tracking-widest">{tpl.iconColor}</span>
                                                </div>
                                              )}
                                              {tpl.gradientColor && /^#[0-9A-Fa-f]{6}$/.test(tpl.gradientColor) && (
                                                <div className="flex items-center gap-1.5">
                                                  <div className="w-3.5 h-3.5 rounded-full border border-ios-gray-5 ring-1 ring-white shrink-0" style={{ backgroundColor: tpl.gradientColor }} title="渐变色" />
                                                  <span className="text-[10px] font-mono text-ios-gray-2 uppercase tracking-widest">{tpl.gradientColor}</span>
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {!tpl.smartExtract && (
                                            <div className="space-y-3 pt-2 border-t border-ios-gray-6">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] font-semibold text-ios-gray-2 shrink-0">{t('sidebar.iconColor')}</span>
                                                <div className="flex items-center gap-1.5">
                                                  {/* NOTE: 可输入/粘贴 HEX 色値的文本框 */}
                                                  <input
                                                    type="text"
                                                    className="w-20 text-[10px] font-mono text-ios-gray-1 uppercase bg-white/60 border border-ios-gray-5 rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary tracking-widest"
                                                    value={tpl.iconColor || ''}
                                                    placeholder="#FF0000"
                                                    onChange={(e) => {
                                                      const val = e.target.value.trim();
                                                      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                                                        onTemplateUpdate(tpl.id, { iconColor: val });
                                                      } else {
                                                        // 允许输入过程中的中间状态，不立刻应用
                                                        onTemplateUpdate(tpl.id, { iconColor: val as any });
                                                      }
                                                    }}
                                                    onBlur={(e) => {
                                                      const val = e.target.value.trim();
                                                      if (!/^#[0-9A-Fa-f]{6}$/.test(val)) {
                                                        // 格式不合法，恢复为之前的合法色値
                                                        onTemplateUpdate(tpl.id, { iconColor: tpl.iconColor });
                                                      }
                                                    }}
                                                  />
                                                  <div
                                                    className="w-5 h-5 rounded-full border border-ios-gray-5 cursor-pointer shadow-ios ring-2 ring-white shrink-0"
                                                    style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(tpl.iconColor || '') ? tpl.iconColor : '#cccccc' }}
                                                    onClick={() => document.getElementById(`cp-${appName}-${tpl.id}-1`)?.click()}
                                                  ></div>
                                                  <input type="color" id={`cp-${appName}-${tpl.id}-1`} className="sr-only" value={tpl.iconColor} onChange={(e) => onTemplateUpdate(tpl.id, { iconColor: e.target.value })} />
                                                </div>
                                              </div>
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] font-semibold text-ios-gray-2 shrink-0">{t('sidebar.gradientColor')}</span>
                                                <div className="flex items-center gap-1.5">
                                                  {/* NOTE: 可输入/粘贴 HEX 色値的文本框 */}
                                                  <input
                                                    type="text"
                                                    className="w-20 text-[10px] font-mono text-ios-gray-1 uppercase bg-white/60 border border-ios-gray-5 rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary tracking-widest"
                                                    value={tpl.gradientColor || ''}
                                                    placeholder="#FF6B6B"
                                                    onChange={(e) => {
                                                      const val = e.target.value.trim();
                                                      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                                                        onTemplateUpdate(tpl.id, { gradientColor: val });
                                                      } else {
                                                        onTemplateUpdate(tpl.id, { gradientColor: val as any });
                                                      }
                                                    }}
                                                    onBlur={(e) => {
                                                      const val = e.target.value.trim();
                                                      if (!/^#[0-9A-Fa-f]{6}$/.test(val)) {
                                                        onTemplateUpdate(tpl.id, { gradientColor: tpl.gradientColor });
                                                      }
                                                    }}
                                                  />
                                                  <div
                                                    className="w-5 h-5 rounded-full border border-ios-gray-5 cursor-pointer shadow-ios ring-2 ring-white shrink-0"
                                                    style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(tpl.gradientColor || '') ? tpl.gradientColor : '#cccccc' }}
                                                    onClick={() => document.getElementById(`cp-${appName}-${tpl.id}-2`)?.click()}
                                                  ></div>
                                                  <input type="color" id={`cp-${appName}-${tpl.id}-2`} className="sr-only" value={tpl.gradientColor} onChange={(e) => onTemplateUpdate(tpl.id, { gradientColor: e.target.value })} />
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {/* NOTE: mt-p-1 保分页弹窗视频专属：截取第 0 帧 */}
                                  {tpl.checked && tpl.id === 'mt-p-1' && (
                                    <div className="my-2 p-3 bg-white/50 rounded-ios border border-black/5 space-y-3 shadow-ios">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('sidebar.personalized')}</span>
                                        <span className="material-symbols-outlined text-ios-gray-3 text-xs">settings_suggest</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <div className="min-w-0">
                                          <span className="text-xs font-bold text-ios-gray-1">截取第0帧</span>
                                          <p className="text-[9px] text-slate-400 font-bold mt-0.5">视频 960 x 1440px / 5s 内</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                          <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={config.captureFirstFrameMtP1 ?? false}
                                            onChange={(e) => onConfigChange({ captureFirstFrameMtP1: e.target.checked })}
                                          />
                                          <div className="w-9 h-5 bg-ios-gray-4 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ios-gray-3 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                        </label>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white/85 via-white/55 to-transparent pointer-events-none">
        <div className="ios-glass p-2 rounded-ios shadow-ios-lg pointer-events-auto">
          <button
            onClick={onGenerate}
            disabled={activeCount === 0 || isProcessing || !templates.some(tpl => tpl.checked)}
            className="w-full py-3.5 px-4 bg-primary hover:brightness-110 text-white rounded-ios font-bold text-sm shadow-ios transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transform active:scale-[0.98]"
          >
            {isProcessing ? (
              <>
                <span className="material-symbols-outlined text-xl animate-spin">sync</span>
                {t('sidebar.generating')} {generationProgress ? `(${generationProgress.current}/${generationProgress.total})` : ''}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-xl fill">bolt</span>
                {t('sidebar.generate')} ({activeCount})
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
