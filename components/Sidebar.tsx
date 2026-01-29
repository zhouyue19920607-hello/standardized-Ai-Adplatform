
import React from 'react';
import { AdTemplate, AdConfig } from '../types';

interface SidebarProps {
  templates: AdTemplate[];
  config: AdConfig;
  onTemplateToggle: (id: string) => void;
  onConfigChange: (newConfig: Partial<AdConfig>) => void;
  activeCount: number;
  onGenerate: () => void;
  isProcessing: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  templates, 
  config, 
  onTemplateToggle, 
  onConfigChange,
  activeCount,
  onGenerate,
  isProcessing
}) => {
  const apps: AdTemplate['app'][] = ['美图秀秀', '美颜', 'wink'];
  
  // Checks if any template of a specific sub-category is selected
  const isSubCategoryActive = (app: string, cat: string) => 
    templates.some(t => t.app === app && t.category === cat && t.checked);

  return (
    <aside className="w-80 bg-white border-r border-slate-200 flex flex-col h-[calc(100vh-73px)] sticky top-[73px]">
      <div className="p-5 border-b border-slate-100">
        <h2 className="font-bold flex items-center gap-2 text-slate-700">
          <span className="material-symbols-outlined text-primary">apps</span>
          广告模版矩阵
        </h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {apps.map(appName => {
          const appTemplates = templates.filter(t => t.app === appName);
          const categories = Array.from(new Set(appTemplates.map(t => t.category)));
          const selectedInApp = appTemplates.filter(t => t.checked).length;

          return (
            <details key={appName} className="group/app bg-white rounded-xl" open>
              <summary className="flex items-center justify-between px-1 py-2 cursor-pointer list-none hover:bg-slate-50 rounded-lg transition-colors">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-slate-400 group-open/app:rotate-90 transition-transform">
                    chevron_right
                  </span>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-1 h-3.5 bg-primary/60 rounded-full"></span>
                    {appName}
                  </h3>
                </div>
                {selectedInApp > 0 && (
                  <span className="text-[10px] bg-blue-50 text-primary px-2 py-0.5 rounded-full font-bold">
                    已选 {selectedInApp}
                  </span>
                )}
              </summary>

              <div className="space-y-2 mt-2 ml-3.5 pl-3 border-l border-slate-100">
                {categories.map(cat => {
                  const subTemplates = appTemplates.filter(t => t.category === cat);
                  const isActive = isSubCategoryActive(appName, cat);

                  return (
                    <details key={`${appName}-${cat}`} className="group bg-slate-50/50 rounded-xl border border-slate-100 overflow-hidden" open={isActive}>
                      <summary className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-slate-100 transition-colors list-none">
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-sm transition-transform group-open:rotate-90 ${isActive ? 'text-primary' : 'text-slate-400'}`}>
                            chevron_right
                          </span>
                          <span className={`text-[11px] font-bold ${isActive ? 'text-primary' : 'text-slate-600'}`}>
                            {cat}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-medium">
                          {subTemplates.length}
                        </span>
                      </summary>
                      
                      <div className="px-2 pb-2 pt-0.5 space-y-0.5">
                        {subTemplates.map(t => (
                          <label key={t.id} className="flex items-center gap-2.5 p-2 hover:bg-white rounded-lg cursor-pointer transition-all group/item border border-transparent hover:border-slate-100">
                            <input 
                              type="checkbox" 
                              checked={t.checked}
                              onChange={() => onTemplateToggle(t.id)}
                              className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5"
                            />
                            <span className={`text-[11px] ${t.checked ? 'text-primary font-bold' : 'text-slate-500'} transition-colors`}>
                              {t.name}
                            </span>
                          </label>
                        ))}
                      </div>

                      {/* Config Panel for Focus Category */}
                      {cat === '焦点视窗' && isActive && (
                        <div className="mx-2 mb-2 p-2.5 bg-white rounded-lg border border-slate-100 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">个性化配置</span>
                            <span className="material-symbols-outlined text-slate-300 text-xs">settings_suggest</span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-600">智能提取配色</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={config.smartExtract}
                                onChange={(e) => onConfigChange({ smartExtract: e.target.checked })}
                              />
                              <div className="w-7 h-3.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                          </div>

                          {!config.smartExtract && (
                            <div className="space-y-2 pt-2 border-t border-slate-50">
                               <div className="flex items-center justify-between gap-2">
                                 <span className="text-[9px] text-slate-500 shrink-0">图标色</span>
                                 <div className="flex items-center gap-1.5 flex-1">
                                   <input 
                                      className="flex-1 text-[9px] font-mono p-1 border border-slate-100 rounded bg-slate-50 uppercase" 
                                      type="text" 
                                      value={config.iconColor}
                                      onChange={(e) => onConfigChange({ iconColor: e.target.value })}
                                   />
                                   <div 
                                      className="w-4 h-4 rounded-sm border border-slate-200 cursor-pointer shrink-0"
                                      style={{ backgroundColor: config.iconColor }}
                                      onClick={() => document.getElementById(`cp-${appName}-${cat}-1`)?.click()}
                                   ></div>
                                   <input 
                                      type="color" id={`cp-${appName}-${cat}-1`} className="sr-only"
                                      value={config.iconColor} onChange={(e) => onConfigChange({ iconColor: e.target.value })}
                                   />
                                 </div>
                               </div>
                               <div className="flex items-center justify-between gap-2">
                                 <span className="text-[9px] text-slate-500 shrink-0">渐变色</span>
                                 <div className="flex items-center gap-1.5 flex-1">
                                   <input 
                                      className="flex-1 text-[9px] font-mono p-1 border border-slate-100 rounded bg-slate-50 uppercase" 
                                      type="text" 
                                      value={config.gradientColor}
                                      onChange={(e) => onConfigChange({ gradientColor: e.target.value })}
                                   />
                                   <div 
                                      className="w-4 h-4 rounded-sm border border-slate-200 cursor-pointer shrink-0"
                                      style={{ backgroundColor: config.gradientColor }}
                                      onClick={() => document.getElementById(`cp-${appName}-${cat}-2`)?.click()}
                                   ></div>
                                   <input 
                                      type="color" id={`cp-${appName}-${cat}-2`} className="sr-only"
                                      value={config.gradientColor} onChange={(e) => onConfigChange({ gradientColor: e.target.value })}
                                   />
                                 </div>
                               </div>
                            </div>
                          )}
                        </div>
                      )}
                    </details>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <button 
          onClick={onGenerate}
          disabled={activeCount === 0 || isProcessing || !templates.some(t => t.checked)}
          className="w-full py-3.5 px-4 bg-primary hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <span className="material-symbols-outlined text-xl animate-spin">sync</span>
              AI 生成中...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-xl group-hover:rotate-12 transition-transform text-white fill">bolt</span>
              执行生成 ({activeCount})
            </>
          )}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
