
import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface HeaderProps {
  onOpenAdmin?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenAdmin }) => {
  const { t, toggleLanguage, language } = useLanguage();

  return (
    <header className="liquid-glass px-8 py-3 sticky top-4 z-50 border border-white/20 mx-4 transition-all duration-300 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-ios shadow-ios">
            <span className="material-symbols-outlined text-white text-2xl">auto_fix_high</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">{t('header.title')}</h1>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{t('header.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <button
            onClick={toggleLanguage}
            className="px-3 py-1.5 rounded-ios bg-white/50 hover:bg-white text-slate-700 font-semibold text-xs transition-all border border-black/5 shadow-ios active:scale-95 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">translate</span>
            {language === 'zh' ? 'EN' : '中'}
          </button>
          <div className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-primary transition-all group">
            <span className="material-symbols-outlined text-lg group-hover:scale-110 transition-transform">help_outline</span>
            <span className="font-semibold">{t('header.guide')}</span>
          </div>
          <div className="h-8 w-8 rounded-full border border-black/5 overflow-hidden cursor-pointer hover:shadow-ios transition-all">
            <img
              alt="Avatar"
              className="w-full h-full object-cover"
              src="https://picsum.photos/seed/user123/100/100"
            />
          </div>
          <div className="w-px h-6 bg-slate-200 ml-2"></div>
          <button
            onClick={onOpenAdmin}
            className="h-9 w-9 flex items-center justify-center rounded-full bg-white/50 hover:bg-white text-slate-600 hover:text-primary transition-all border border-black/5 shadow-ios active:scale-95"
            title={t('header.admin')}
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
