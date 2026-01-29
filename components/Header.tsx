
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-1.5 rounded-lg">
            <span className="material-symbols-outlined text-white text-2xl">auto_fix_high</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">标准化硬广AI自动化处理平台</h1>
            <p className="text-xs text-slate-400 font-medium">焦点视窗自定义升级看板</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-lg">help_outline</span>
            <span>使用指南</span>
          </div>
          <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden cursor-pointer hover:ring-2 ring-primary/20 transition-all">
            <img 
              alt="Avatar" 
              className="w-full h-full object-cover" 
              src="https://picsum.photos/seed/user123/100/100"
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
