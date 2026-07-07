import React, { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useLocation, Link } from 'react-router-dom';
import { getMeituAuthState, getMeituLoginUrl, logoutMeituAuth, MeituAuthState } from '../services/api';

interface HeaderProps {
  onOpenAdmin?: () => void;
}

const CREATIVE_ENTRY_HINT_SESSION_KEY = 'saap_creative_entry_hint_seen_session_v1';
const CREATIVE_ENTRY_HINT_LEGACY_KEY = 'saap_creative_entry_hint_seen_v1';

const Header: React.FC<HeaderProps> = ({ onOpenAdmin }) => {
  const { t, toggleLanguage, language } = useLanguage();
  const location = useLocation();
  const isConfigPage = location.pathname === '/config';
  const [showCreativeEntryHint, setShowCreativeEntryHint] = useState(false);
  const [authState, setAuthState] = useState<MeituAuthState | null>(null);

  useEffect(() => {
    if (isConfigPage || typeof window === 'undefined') {
      setShowCreativeEntryHint(false);
      return;
    }

    window.localStorage.removeItem(CREATIVE_ENTRY_HINT_LEGACY_KEY);
    if (window.sessionStorage.getItem(CREATIVE_ENTRY_HINT_SESSION_KEY) === '1') return;

    const openTimer = window.setTimeout(() => {
      setShowCreativeEntryHint(true);
    }, 600);

    const closeTimer = window.setTimeout(() => {
      setShowCreativeEntryHint(false);
    }, 12000);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
    };
  }, [isConfigPage]);

  const dismissCreativeEntryHint = () => {
    setShowCreativeEntryHint(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CREATIVE_ENTRY_HINT_LEGACY_KEY);
      window.sessionStorage.setItem(CREATIVE_ENTRY_HINT_SESSION_KEY, '1');
    }
  };

  useEffect(() => {
    let cancelled = false;
    getMeituAuthState()
      .then(state => {
        if (!cancelled) setAuthState(state);
      })
      .catch(() => {
        if (!cancelled) setAuthState({ configured: false, authenticated: false, user: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    await logoutMeituAuth();
    setAuthState(prev => ({ configured: prev?.configured ?? true, authenticated: false, user: null }));
  };

  const authDisplayName = authState?.user?.displayName || authState?.user?.name || authState?.user?.login_email || '已登录';

  return (
    <header className={`liquid-glass px-8 py-3 sticky top-4 z-50 border border-white/20 mx-4 transition-all duration-300 shadow-lg ${isConfigPage ? 'creative-board-topbar' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="creative-entry-hint-anchor">
          {!isConfigPage && showCreativeEntryHint && (
            <>
              <span className="creative-entry-hint-pulse" aria-hidden="true" />
              <div className="creative-entry-hint-bubble" role="status">
                <span className="creative-entry-hint-dot" aria-hidden="true" />
                <div>
                  <p className="text-[11px] font-black text-slate-950 leading-none">点击这里</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500 leading-none">进入创新形式看板</p>
                </div>
                <button
                  type="button"
                  className="creative-entry-hint-close"
                  aria-label="关闭创新形式看板入口提示"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    dismissCreativeEntryHint();
                  }}
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            </>
          )}
          <Link
            to={isConfigPage ? '/' : '/config'}
            onClick={dismissCreativeEntryHint}
            className="flex items-center gap-3 group/logo cursor-pointer hover:opacity-80 transition-all"
          >
            <div className={`h-10 w-10 bg-primary rounded-[10px] shadow-ios transition-transform duration-500 flex items-center justify-center ${isConfigPage ? 'rotate-180 bg-slate-800' : 'group-hover/logo:rotate-12'}`}>
              <span className="material-symbols-outlined text-white text-2xl animate-eye-look">
                visibility
              </span>
            </div>
            <div>
              <h1 className={`text-lg font-bold tracking-tight ${isConfigPage ? 'text-white' : 'text-slate-900'}`}>
                {isConfigPage ? '创新形式标准素材看板' : t('header.title')}
              </h1>
              <p className={`text-[10px] font-semibold tracking-normal text-left ${isConfigPage ? 'text-white/60' : 'text-slate-500'}`}>
                {isConfigPage ? '自定义模版' : t('header.subtitle')}
              </p>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-5">
          {authState?.configured && (
            authState.authenticated ? (
              <div className="flex items-center gap-2 rounded-full border border-black/5 bg-white/55 px-3 py-1.5 shadow-ios">
                <span className="material-symbols-outlined text-[17px] text-emerald-600">verified_user</span>
                <span className="max-w-[120px] truncate text-xs font-bold text-slate-700">{authDisplayName}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-slate-900"
                >
                  退出
                </button>
              </div>
            ) : (
              <a
                href={getMeituLoginUrl(`${location.pathname}${location.search}`)}
                className="rounded-full border border-black/5 bg-slate-950 px-4 py-2 text-xs font-black text-white shadow-ios transition-all hover:-translate-y-0.5 hover:bg-slate-800 active:scale-95"
              >
                OA 登录
              </a>
            )
          )}
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
