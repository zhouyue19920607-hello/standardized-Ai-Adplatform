import React, { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useLocation, Link } from 'react-router-dom';
import { getMeituAuthState, getMeituLoginUrl, logoutMeituAuth, MeituAuthState } from '../services/api';

interface HeaderProps {
  onOpenAdmin?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenAdmin }) => {
  const { t } = useLanguage();
  const location = useLocation();
  const isConfigPage = location.pathname === '/config';
  const [authState, setAuthState] = useState<MeituAuthState | null>(null);

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
        <div className="flex min-w-0 items-center gap-5">
          <div className="board-brand-cluster">
            <Link
              to={isConfigPage ? '/' : '/config'}
              className="group/logo board-brand-icon-link"
              aria-label={isConfigPage ? '返回标准化素材看板' : '进入创新形式素材看板'}
            >
              <div className={`board-brand-icon ${isConfigPage ? 'board-brand-icon--creative' : ''}`}>
                <span className="material-symbols-outlined animate-eye-look">
                  visibility
                </span>
              </div>
            </Link>
            <nav className="board-brand-nav" aria-label="素材看板切换">
              <span className={`board-brand-name ${isConfigPage ? 'text-white' : 'text-slate-950'}`}>
                品牌素材自动化处理
              </span>
              <span className="board-brand-slash" aria-hidden="true">/</span>
              <Link
                to={isConfigPage ? '/config' : '/'}
                className="board-nav-link is-active"
                aria-current="page"
              >
                {isConfigPage ? '创新看板' : '标准看板'}
              </Link>
              <Link
                to={isConfigPage ? '/' : '/config'}
                className="board-nav-link"
              >
                {isConfigPage ? '标准看板' : '创新看板'}
              </Link>
            </nav>
          </div>
        </div>
        <div className="flex items-center gap-5">
          {authState?.configured && (
            authState.authenticated ? (
              <div className="flex items-center gap-2 rounded-full border border-black/5 bg-white/55 px-3 py-1.5 shadow-ios">
                <span className="material-symbols-outlined text-[17px] text-emerald-600">verified_user</span>
                <span className="max-w-[160px] truncate text-xs font-bold text-slate-700">Hello，{authDisplayName}</span>
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
