import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useLocation, Link } from 'react-router-dom';

interface HeaderProps {
  onOpenAdmin?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenAdmin }) => {
  const { t, toggleLanguage, language } = useLanguage();
  const location = useLocation();
  const isConfigPage = location.pathname === '/config';

  return (
    <header className={`liquid-glass px-8 py-3 sticky top-4 z-50 border border-white/20 mx-4 transition-all duration-300 shadow-lg ${isConfigPage ? 'creative-board-topbar' : ''}`}>
      <div className="flex items-center justify-between">
        <Link to={isConfigPage ? '/' : '/config'} className="flex items-center gap-3 group/logo cursor-pointer hover:opacity-80 transition-all">
          <div className={`h-10 w-10 bg-primary rounded-[10px] shadow-ios transition-transform duration-500 flex items-center justify-center ${isConfigPage ? 'rotate-180 bg-slate-800' : 'group-hover/logo:rotate-12'}`}>
            <span className="material-symbols-outlined text-white text-2xl animate-eye-look">
              visibility
            </span>
          </div>
          <div>
            <h1 className={`text-lg font-bold tracking-tight ${isConfigPage ? 'text-white' : 'text-slate-900'}`}>
              {isConfigPage ? '创新形式标准素材看板' : t('header.title')}
            </h1>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${isConfigPage ? 'text-white/60' : 'text-slate-500'}`}>
              {isConfigPage ? '自定义模版' : t('header.subtitle')}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-5">
          <button
            onClick={toggleLanguage}
            className="px-3 py-1.5 rounded-ios bg-white/50 hover:bg-white text-slate-700 font-semibold text-xs transition-all border border-black/5 shadow-ios active:scale-95 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">translate</span>
            {language === 'zh' ? 'EN' : '中'}
          </button>
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
