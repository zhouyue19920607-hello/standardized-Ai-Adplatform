
import React from 'react';

interface FooterProps {
  selectedCount: number;
  assetCount: number;
}

const Footer: React.FC<FooterProps> = ({ selectedCount, assetCount }) => {
  return (
    <footer className="bg-white border-t border-slate-200 p-5 z-50 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)]">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-10">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">已选样式</span>
            <span className="font-black text-slate-800">{selectedCount} 个层级模版</span>
          </div>
          <div className="w-px h-8 bg-slate-200"></div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">导出预估</span>
            <span className="font-black text-slate-800">{assetCount} 份适配资产</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="px-10 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm transition-all flex items-center gap-2 shadow-sm">
            <span className="material-symbols-outlined text-lg">file_download</span>
            批量下载资产包 ({assetCount})
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
