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
  onTemplateUpdate
}) => {
  const { t } = useLanguage();
  if (!Array.isArray(templates)) return null;
  const apps: AdTemplate['app'][] = ['美图秀秀', '美颜', 'wink'];

  // State for collapsible sub-categories (Key format: "AppName-CategoryName")
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  // Helper to toggle expansion
  const toggleCat = (key: string) => {
    setExpandedCats(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper to init expansion state on first load (e.g. expand all by default or first one)
  // Simple approach: controlled by click. Default collapsed? 
  // User "still needs expand/collapse", implies they want control. 
  // I'll default to 'true' (expanded) for meaningful content.
  useEffect(() => {
    const initialExpanded: Record<string, boolean> = {};
    templates.forEach(tpl => {
      const key = `${tpl.app}-${tpl.category}`;
      if (initialExpanded[key] === undefined) initialExpanded[key] = true;
    });
    setExpandedCats(prev => ({ ...initialExpanded, ...prev }));
  }, []);

  return (
    <aside className="w-[340px] sticky top-24 h-[calc(100vh-180px)] flex flex-col liquid-glass ml-4 my-4 shrink-0 overflow-hidden shadow-2xl z-50">
      <div className="px-6 py-4 shrink-0 flex items-center">
        <p className="text-sm text-slate-900 font-bold">{t('sidebar.selectCat')}</p>
      </div>

      <div className="flex-1 p-3 space-y-6 overflow-y-auto custom-scrollbar pb-24">
        {apps.map(appName => {
          const appTemplates = templates.filter(tpl => tpl.app === appName);
          const isDisabledApp = appName === 'wink' || appName === '美颜';

          // Get unique categories for this app
          const categories = Array.from(new Set(appTemplates.map(tpl => tpl.category)));

          return (
            <div key={appName} className="space-y-2 group">
              {/* App Header */}
              <div className="flex items-center gap-2 px-3">
                <h3 className="text-xs font-bold text-slate-800">{t(`apps.${appName}`)}</h3>
                {isDisabledApp && (
                  <span className="text-[9px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full font-semibold">{t('sidebar.waiting')}</span>
                )}
              </div>

              <div className={`transition-all`}>
                {/* If disabled app, show placeholder or simplified list */}
                {isDisabledApp ? (
                  <div className="p-8 text-center bg-gray-50/50">
                    <span className="material-symbols-outlined text-ios-gray-3 text-3xl mb-2">construction</span>
                    <p className="text-xs text-ios-gray-2 font-medium">{t('sidebar.noTemplate')}</p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {categories.map(cat => {
                      const subTemplates = appTemplates.filter(tpl => tpl.category === cat);
                      const expandKey = `${appName}-${cat}`;
                      const isExpanded = expandedCats[expandKey] ?? true; // Default true
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
                                <div key={tpl.id} className="px-1">
                                  <label
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
                                      <span className="text-[10px] text-slate-500 font-bold font-mono tracking-tight">{tpl.dimensions}</span>
                                    </div>
                                  </label>

                                  {/* Config Panel (Inline) - Focal Window or Dynamic Splash */}
                                  {tpl.checked && (tpl.category === '焦点视窗' || (tpl.category === '开屏' && tpl.name.includes('动态'))) && (
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
                                      {tpl.category === '焦点视窗' && (
                                        <>
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-ios-gray-1">{t('sidebar.smartExtract')}</span>
                                            <div className="flex items-center gap-2 shrink-0">
                                              {tpl.smartExtract && tpl.palette && tpl.palette.length > 1 && (
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

                                          {!tpl.smartExtract && (
                                            <div className="space-y-3 pt-2 border-t border-ios-gray-6">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] font-semibold text-ios-gray-2 shrink-0">{t('sidebar.iconColor')}</span>
                                                <div className="flex items-center gap-2">
                                                  <span className="text-[10px] font-mono text-ios-gray-3 uppercase">{tpl.iconColor}</span>
                                                  <div
                                                    className="w-5 h-5 rounded-full border border-ios-gray-5 cursor-pointer shadow-ios ring-2 ring-white"
                                                    style={{ backgroundColor: tpl.iconColor }}
                                                    onClick={() => document.getElementById(`cp-${appName}-${tpl.id}-1`)?.click()}
                                                  ></div>
                                                  <input type="color" id={`cp-${appName}-${tpl.id}-1`} className="sr-only" value={tpl.iconColor} onChange={(e) => onTemplateUpdate(tpl.id, { iconColor: e.target.value })} />
                                                </div>
                                              </div>
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] font-semibold text-ios-gray-2 shrink-0">{t('sidebar.gradientColor')}</span>
                                                <div className="flex items-center gap-2">
                                                  <span className="text-[10px] font-mono text-ios-gray-3 uppercase">{tpl.gradientColor}</span>
                                                  <div
                                                    className="w-5 h-5 rounded-full border border-ios-gray-5 cursor-pointer shadow-ios ring-2 ring-white"
                                                    style={{ backgroundColor: tpl.gradientColor }}
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
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-transparent pointer-events-none">
        <div className="ios-glass p-2 rounded-ios shadow-ios-lg pointer-events-auto">
          <button
            onClick={onGenerate}
            disabled={activeCount === 0 || isProcessing || !templates.some(tpl => tpl.checked)}
            className="w-full py-3.5 px-4 bg-primary hover:brightness-110 text-white rounded-ios font-bold text-sm shadow-ios transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transform active:scale-[0.98]"
          >
            {isProcessing ? (
              <>
                <span className="material-symbols-outlined text-xl animate-spin">sync</span>
                {t('sidebar.generating')}
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
