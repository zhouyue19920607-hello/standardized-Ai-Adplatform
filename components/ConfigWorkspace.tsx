import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

const ConfigWorkspace: React.FC = () => {
    const { t } = useLanguage();
    const [expandedCategory, setExpandedCategory] = useState<string | null>('splash');
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['xiuxiu']);

    const platforms = [
        { id: 'xiuxiu', name: '秀秀', icon: 'auto_fix_high' },
        { id: 'meiyan', name: '美颜', icon: 'face_retouching_natural' },
        { id: 'wink', name: 'Wink', icon: 'movie_edit' }
    ];

    const categories = [
        {
            id: 'splash',
            label: '开屏创意模版',
            icon: 'wb_sunny',
            templates: [
                { id: 'dynamic-splash', label: '炫动开屏' },
                { id: 'slide-splash', label: '滑动开屏' },
                { id: 'twist-splash', label: '扭转开屏' },
            ]
        },
        {
            id: 'home',
            label: '首页创意模版',
            icon: 'home_app_logo',
            templates: [
                { id: 'focal-static', label: '静态焦点视窗' },
                { id: 'focal-dynamic', label: '动态焦点视窗' },
                { id: 'banner-standard', label: '标准 Banner' },
            ]
        }
    ];

    const handleCategoryClick = (catId: string) => {
        setExpandedCategory(expandedCategory === catId ? null : catId);
    };

    const handleTemplateClick = (tplId: string) => {
        setExpandedTemplate(expandedTemplate === tplId ? null : tplId);
        setIsGenerating(false);
    };

    const togglePlatform = (id: string) => {
        setSelectedPlatforms(prev =>
            prev.includes(id)
                ? prev.filter(p => p !== id)
                : [...prev, id]
        );
    };

    const handleGenerate = () => {
        if (!expandedTemplate) return;
        setIsGenerating(true);
    };

    return (
        <div className="fixed inset-0 top-[73px] bg-[#0A0A0A] z-0 overflow-hidden text-zinc-300">
            <div className="flex h-full gap-6 p-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Configuration Sidebar - 20px Rounded */}
                <aside className="w-80 bg-zinc-950/40 backdrop-blur-3xl rounded-[20px] border border-white/5 p-6 flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
                    <div className="px-2 py-3 mb-6 flex items-center gap-3 shrink-0">
                        <div className="w-10 h-10 bg-white/5 rounded-[20px] flex items-center justify-center border border-white/10 shadow-inner">
                            <span className="material-symbols-outlined text-white text-2xl">auto_awesome_motion</span>
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-white tracking-widest uppercase">模版管理</h2>
                            <p className="text-[10px] text-zinc-600 font-bold tracking-tighter">TEMPLATE MANAGER</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                        {categories.map((cat) => (
                            <div key={cat.id} className="space-y-2">
                                <button
                                    onClick={() => handleCategoryClick(cat.id)}
                                    className={`w-full flex items-center justify-between px-5 py-4 rounded-[20px] transition-all duration-500 ${expandedCategory === cat.id ? 'bg-white/10 text-white shadow-inner' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-[20px] font-light">{cat.icon}</span>
                                        <span className="text-sm font-black tracking-tight">{cat.label}</span>
                                    </div>
                                    <span className={`material-symbols-outlined text-sm transition-transform duration-500 ${expandedCategory === cat.id ? 'rotate-180 text-white' : ''}`}>expand_more</span>
                                </button>

                                {expandedCategory === cat.id && (
                                    <div className="pl-4 space-y-3 py-2 animate-in fade-in slide-in-from-top-4 duration-500">
                                        {cat.templates.map((tpl) => (
                                            <div key={tpl.id} className="space-y-3">
                                                <button
                                                    onClick={() => handleTemplateClick(tpl.id)}
                                                    className={`w-full flex items-center justify-between px-5 py-3 rounded-[20px] text-xs font-bold transition-all duration-300 ${expandedTemplate === tpl.id ? 'text-white bg-white/15 shadow-2xl border border-white/10' : 'text-zinc-500 hover:text-zinc-200'}`}
                                                >
                                                    <span>{tpl.label}</span>
                                                    <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${expandedTemplate === tpl.id ? 'bg-primary shadow-[0_0_10px_#FF2E63]' : 'bg-zinc-800'}`}></div>
                                                </button>

                                                {expandedTemplate === tpl.id && (
                                                    <div className="mx-2 p-5 bg-black/40 backdrop-blur-md rounded-[20px] border border-white/5 space-y-5 animate-in zoom-in-95 duration-300">
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between items-center px-1">
                                                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">图片素材</p>
                                                                <div className="bg-primary/10 px-1.5 py-0.5 rounded-[20px] border border-primary/20">
                                                                    <span className="text-[7px] text-primary font-black animate-pulse uppercase tracking-widest">Sync</span>
                                                                </div>
                                                            </div>
                                                            <div className="border border-white/5 bg-white/5 rounded-[20px] p-4 hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer group flex flex-col items-center border-dashed">
                                                                <span className="material-symbols-outlined text-zinc-600 group-hover:text-white transition-colors text-2xl">add_photo_alternate</span>
                                                                <p className="text-[9px] text-zinc-500 mt-2 font-black uppercase tracking-tight group-hover:text-zinc-300">上传原始图片</p>
                                                            </div>
                                                            <div className="relative group/input">
                                                                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                                                    <span className="material-symbols-outlined text-[14px] text-zinc-600 group-focus-within/input:text-primary transition-colors">magic_button</span>
                                                                </div>
                                                                <input
                                                                    type="text"
                                                                    placeholder="输入提示词生成..."
                                                                    className="w-full h-10 bg-zinc-900/80 border border-white/5 rounded-[20px] pl-10 pr-4 text-[10px] text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-bold"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3">
                                                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-1">开屏素材上传</p>
                                                            <div className="border border-white/5 bg-white/5 rounded-[20px] p-6 hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer group flex flex-col items-center border-dashed">
                                                                <div className="flex -space-x-3 mb-2">
                                                                    <div className="w-9 h-9 bg-zinc-900 rounded-full flex items-center justify-center border border-white/10 shadow-2xl group-hover:-translate-x-2 transition-transform">
                                                                        <span className="material-symbols-outlined text-zinc-500 group-hover:text-white text-base">movie</span>
                                                                    </div>
                                                                    <div className="w-9 h-9 bg-zinc-800 rounded-full flex items-center justify-center border border-white/10 shadow-2xl group-hover:translate-x-2 transition-transform">
                                                                        <span className="material-symbols-outlined text-zinc-400 group-hover:text-white text-base">image</span>
                                                                    </div>
                                                                </div>
                                                                <p className="text-[9px] text-zinc-500 font-black group-hover:text-zinc-200 uppercase tracking-widest text-center leading-relaxed">支持图片 / 视频</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 pt-6 border-t border-white/5 shrink-0">
                        <button
                            onClick={handleGenerate}
                            className="w-full bg-white text-black py-5 rounded-[20px] font-black text-[11px] shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:bg-zinc-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-[0.2em] group"
                        >
                            <span className="material-symbols-outlined text-xl group-hover:animate-bounce transition-all">bolt</span>
                            立即生成资产
                        </button>
                    </div>
                </aside>

                {/* Main Content Area - 20px Rounded */}
                <main className="flex-1 bg-zinc-950/20 backdrop-blur-3xl rounded-[20px] border border-white/5 shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
                    <header className="px-10 py-8 border-b border-white/5 bg-black/10 backdrop-blur-md flex justify-between items-center shrink-0">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="px-3 py-1 rounded-[20px] bg-white/5 text-zinc-500 text-[9px] font-black uppercase tracking-widest border border-white/5">Design Engine V4.0</span>
                                <div className="flex items-center gap-1.5 antialiased">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#10B981]"></div>
                                    <span className="text-[9px] text-zinc-600 font-black uppercase tracking-tight">Active Preview</span>
                                </div>
                            </div>
                            <h1 className="text-3xl font-black text-white tracking-tighter antialiased">创新形式呈现</h1>
                        </div>
                        <div className="flex gap-4">
                            <button className="h-12 w-12 flex items-center justify-center rounded-[20px] bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10 transition-all border border-white/5">
                                <span className="material-symbols-outlined text-xl">help_outline</span>
                            </button>
                            <button className="px-8 py-3 rounded-[20px] bg-zinc-100 text-black font-black text-[11px] shadow-2xl hover:bg-white transition-all uppercase tracking-widest active:scale-95">保存预设</button>
                        </div>
                    </header>

                    <div className="flex-1 overflow-auto p-12 custom-scrollbar flex flex-col">
                        {!expandedTemplate ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-10 animate-in fade-in duration-1000">
                                <div className="w-32 h-32 bg-white/[0.02] rounded-[20px] flex items-center justify-center text-zinc-700 border border-white/[0.03] shadow-inner relative group transition-all">
                                    <div className="absolute inset-0 bg-primary/5 rounded-[20px] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <span className="material-symbols-outlined text-6xl group-hover:scale-110 group-hover:text-zinc-600 transition-all duration-700">play_circle</span>
                                </div>
                                <div className="max-w-md space-y-4">
                                    <h2 className="text-2xl font-black text-zinc-300 tracking-tighter uppercase tracking-widest">载入预览管道</h2>
                                    <p className="text-xs text-zinc-600 font-bold leading-relaxed tracking-wide px-10 text-center">
                                        请从左侧栏选择一个创意模版
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-700 min-h-0">
                                {/* Result Display Area - 20px Rounded */}
                                <section className="flex-1 min-h-0 bg-white/5 rounded-[20px] border border-white/5 shadow-[0_50px_150px_rgba(0,0,0,0.5)] overflow-hidden relative group">
                                    <div className="absolute inset-0 flex items-center justify-center p-12">
                                        {isGenerating ? (
                                            <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-1000">
                                                <div className="aspect-[9/16] h-full max-h-[60vh] bg-zinc-900 rounded-[20px] border border-white/10 shadow-2xl flex items-center justify-center relative overflow-hidden ring-1 ring-white/5">
                                                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40"></div>
                                                    <span className="material-symbols-outlined text-zinc-600 text-5xl animate-pulse">movie</span>
                                                    <div className="absolute bottom-8 left-0 right-0 text-center">
                                                        <p className="text-[8px] font-black text-white/60 uppercase tracking-[0.3em]">最终产出内容</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500">
                                                <div className="aspect-video w-[80%] max-w-[700px] bg-zinc-950/80 rounded-[20px] border border-white/5 shadow-2xl flex items-center justify-center relative overflow-hidden group cursor-pointer hover:bg-zinc-900 transition-all duration-500 ring-1 ring-white/5">
                                                    <div className="w-16 h-16 bg-white/10 rounded-[20px] flex items-center justify-center shadow-2xl border border-white/20 group-hover:scale-110 transition-transform duration-500 backdrop-blur-xl">
                                                        <span className="material-symbols-outlined text-white text-3xl ml-0.5">play_arrow</span>
                                                    </div>
                                                    <div className="absolute top-6 left-6 px-4 py-1.5 rounded-full bg-white/10 border border-white/10 text-[8px] font-black text-white/70 uppercase tracking-[0.3em] backdrop-blur-md">
                                                        教程演示
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* Ultra Compact Platform Selector - 20px Rounded */}
                                <div className="flex items-center justify-center gap-10 py-5 px-10 mb-2 bg-white/[0.03] backdrop-blur-xl rounded-[20px] border border-white/5 shadow-lg w-fit mx-auto ring-1 ring-white/5">
                                    {platforms.map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => togglePlatform(p.id)}
                                            className={`flex flex-col items-center gap-1.5 transition-all duration-500 group ${selectedPlatforms.includes(p.id) ? 'scale-105 select-none' : 'opacity-20 hover:opacity-100 hover:scale-105'}`}
                                        >
                                            <div className={`w-9 h-9 rounded-[20px] flex items-center justify-center border transition-all duration-500 ${selectedPlatforms.includes(p.id) ? 'bg-white/10 border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'bg-transparent border-transparent'}`}>
                                                <span className={`material-symbols-outlined text-[1.3rem] transition-colors ${selectedPlatforms.includes(p.id) ? 'text-white' : 'text-zinc-600 group-hover:text-white'}`}>{p.icon}</span>
                                            </div>
                                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-colors ${selectedPlatforms.includes(p.id) ? 'text-zinc-400' : 'text-zinc-700'}`}>{p.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default ConfigWorkspace;
