
import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface FooterProps {
  selectedCount: number;
  assetCount: number;
  onDownload: () => void;
}

const Footer: React.FC<FooterProps> = ({ selectedCount, assetCount, onDownload }) => {
  const { t } = useLanguage();
  return (
    <footer className="liquid-glass border-t border-white/10 py-2 px-6 z-30 fixed bottom-0 left-0 right-0 shadow-2xl rounded-none">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-10">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase font-black text-slate-500 tracking-widest">{t('footer.selectedStyles')}</span>
            <span className="font-black text-slate-900 text-sm">{selectedCount}{t('footer.templateUnits')}</span>
          </div>
          <div className="w-px h-6 bg-slate-200"></div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase font-black text-slate-500 tracking-widest">{t('footer.exportPredict')}</span>
            <span className="font-black text-slate-900 text-sm">{assetCount}{t('footer.assetUnits')}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onDownload}
            disabled={assetCount === 0}
            className={`px-6 py-2 rounded-xl border font-bold text-xs transition-all flex items-center gap-2 shadow-sm lens-effect
              ${assetCount > 0
                ? 'bg-primary text-white border-white/20 hover:scale-105 active:scale-95'
                : 'bg-white/5 text-white/20 border-white/5 cursor-not-allowed'}`}
          >
            <span className="material-symbols-outlined text-base">file_download</span>
            {t('footer.batchDownload')} ({assetCount})
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
