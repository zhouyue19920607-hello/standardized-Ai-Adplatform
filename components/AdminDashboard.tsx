import React, { useState, useEffect, useRef } from 'react';
import { AdTemplate, AdAsset } from '../types';
import { getTemplates, updateTemplate, uploadMask, uploadCropOverlay, uploadBadgeOverlay, getWorkflows, uploadWorkflow, ASSETS_URL, createTemplate, deleteTemplate, smartCropImage, reorderTemplates } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

interface AdminDashboardProps {
    onClose: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<'templates' | 'workflows'>('templates');
    const [templates, setTemplates] = useState<AdTemplate[]>([]);
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [assetsVersion, setAssetsVersion] = useState(Date.now());

    // Advanced Management State
    const [filterApp, setFilterApp] = useState<string>('ALL');
    const [draggedId, setDraggedId] = useState<string | null>(null);

    // Form state for new template
    const [newTemplate, setNewTemplate] = useState({
        name: '',
        app: '美图秀秀',
        category: '开屏',
        dimensions: '1080 x 1920'
    });

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [tData, wData] = await Promise.all([getTemplates(), getWorkflows()]);
            setTemplates(tData);
            setWorkflows(wData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTemplate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const newTpl = await createTemplate({ ...newTemplate, checked: false });
            setTemplates(prev => [...prev, newTpl]);
            setNewTemplate({ name: '', app: '美图秀秀', category: '开屏', dimensions: '1080 x 1920' });
        } catch (error) {
            console.error("Failed to create template", error);
            alert(t('admin.failCreate'));
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        if (!window.confirm(t('admin.confirmDelete'))) return;
        try {
            await deleteTemplate(id);
            setTemplates(prev => prev.filter(tpl => tpl.id !== id));
        } catch (error) {
            console.error("Failed to delete template", error);
            alert(t('admin.failDelete'));
        }
    };

    const handleUpdateField = async (id: string, field: string, value: string) => {
        try {
            await updateTemplate(id, { [field]: value });
            setTemplates(prev => prev.map(tpl => tpl.id === id ? { ...tpl, [field]: value } : tpl));
        } catch (error) {
            console.error(`Failed to update ${field}`, error);
            alert(t('admin.failUpdate'));
        }
    };

    const handleMaskUpload = async (id: string, file: File) => {
        try {
            const { mask_path } = await uploadMask(id, file);
            setTemplates(prev => prev.map(tpl => tpl.id === id ? { ...tpl, mask_path } : tpl));
            setAssetsVersion(Date.now());
        } catch (error) {
            console.error("Failed to upload mask", error);
            alert(t('admin.failUpload'));
        }
    };

    const handleCropOverlayUpload = async (id: string, file: File) => {
        try {
            const { crop_overlay_path } = await uploadCropOverlay(id, file); // Ensure import in next step or assume generic import
            setTemplates(prev => prev.map(tpl => tpl.id === id ? { ...tpl, crop_overlay_path } : tpl));
            setAssetsVersion(Date.now());
        } catch (error) {
            console.error("Failed to upload crop overlay", error);
            alert(t('admin.failUpload'));
        }
    };

    const handleBadgeOverlayUpload = async (id: string, file: File) => {
        try {
            const { badge_overlay_path } = await uploadBadgeOverlay(id, file);
            setTemplates(prev => prev.map(tpl => tpl.id === id ? { ...tpl, badge_overlay_path } : tpl));
            setAssetsVersion(Date.now());
        } catch (error) {
            console.error("Failed to upload badge overlay", error);
            alert("广告角标图上传失败。");
        }
    };

    const handleWorkflowUpload = async (file: File) => {
        try {
            await uploadWorkflow(file);
            fetchData();
        } catch (error) {
            console.error("Failed to upload workflow", error);
            alert("工作流上传失败。");
        }
    }

    // ---- Drag and Drop Logic ----
    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = "move";
        // 拖拽时设置透明度，增加视觉反馈
        (e.target as HTMLElement).style.opacity = '0.5';
    };

    const handleDragEnd = (e: React.DragEvent) => {
        setDraggedId(null);
        (e.target as HTMLElement).style.opacity = '1';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // 允许 Drop
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = async (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;

        // Clone current list
        const newList = [...templates];
        const draggedIndex = newList.findIndex(tpl => tpl.id === draggedId);
        const targetIndex = newList.findIndex(tpl => tpl.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) return;

        // Move item
        const [movedItem] = newList.splice(draggedIndex, 1);
        newList.splice(targetIndex, 0, movedItem);

        // Optimistic update
        setTemplates(newList);

        // API Call
        try {
            await reorderTemplates(newList);
        } catch (error) {
            console.error("Failed to reorder templates", error);
            alert("排序保存失败");
            fetchData(); // Revert on failure
        }
    };

    // Filter Logic
    const filteredTemplates = templates.filter(tpl => filterApp === 'ALL' || tpl.app === filterApp);

    // Duplicate Check Helper
    const isDuplicate = (t: AdTemplate) => {
        return filteredTemplates.filter(item => item.name === t.name && item.dimensions === t.dimensions && item.app === t.app).length > 1;
    };

    return (
        <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6"
            style={{ fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' }}
        >
            <div className="bg-white w-full max-w-7xl h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300 ring-1 ring-white/20">
                {/* Header Section */}
                <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white/80 backdrop-blur-xl sticky top-0 z-20">
                    <div className="flex items-center gap-8">
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                            <span className="w-2 h-8 bg-indigo-600 rounded-full"></span>
                            {t('admin.title')}
                        </h2>

                        {/* Modern Tab Switcher */}
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button
                                onClick={() => setActiveTab('templates')}
                                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${activeTab === 'templates' ? 'bg-white shadow-md text-slate-900 scale-[1.02]' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t('admin.templates')}
                            </button>
                            <button
                                onClick={() => setActiveTab('workflows')}
                                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${activeTab === 'workflows' ? 'bg-white shadow-md text-slate-900 scale-[1.02]' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t('admin.workflows')}
                            </button>
                        </div>


                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-all active:scale-95"
                    >
                        <span className="material-symbols-outlined font-bold">close</span>
                    </button>
                </div>


                {/* Content Area */}
                <div className="flex-1 overflow-auto bg-slate-50/50 p-6 md:p-8 custom-scrollbar">
                    {activeTab === 'templates' ? (
                        <div className="space-y-6 max-w-[1400px] mx-auto">
                            {/* Premium Create Form - Compact Version */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300">
                                <div className="flex flex-col xl:flex-row xl:items-end gap-5">
                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="group">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">{t('admin.templateName')}</label>
                                            <input
                                                required
                                                className="block w-full bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-0 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 transition-all placeholder:text-slate-300"
                                                placeholder="例如：618大促开屏"
                                                value={newTemplate.name}
                                                onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                                            />
                                        </div>
                                        <div className="group">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">{t('admin.appName')}</label>
                                            <select
                                                className="block w-full bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-0 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 transition-all cursor-pointer"
                                                value={newTemplate.app}
                                                onChange={(e) => setNewTemplate(prev => ({ ...prev, app: e.target.value }))}
                                            >
                                                <option>美图秀秀</option>
                                                <option disabled value="美颜">美颜 (待开放)</option>
                                                <option disabled value="wink">wink (待开放)</option>
                                            </select>
                                        </div>
                                        <div className="group">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">{t('admin.category')}</label>
                                            <select
                                                className="block w-full bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-0 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 transition-all cursor-pointer"
                                                value={newTemplate.category}
                                                onChange={(e) => setNewTemplate(prev => ({ ...prev, category: e.target.value }))}
                                            >
                                                <option>开屏</option>
                                                <option>焦点视窗</option>
                                                <option>信息流</option>
                                                <option>icon/banner</option>
                                                <option>弹窗</option>
                                            </select>
                                        </div>
                                        <div className="group">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">{t('admin.dimensions')}</label>
                                            <input
                                                className="block w-full bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-0 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 transition-all text-center font-mono"
                                                placeholder="1080 x 1920"
                                                value={newTemplate.dimensions}
                                                onChange={(e) => setNewTemplate(prev => ({ ...prev, dimensions: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleCreateTemplate}
                                        className="h-[42px] px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">add</span>
                                        {t('admin.add')}
                                    </button>
                                </div>
                            </div>

                            {/* App Filter Tabs */}
                            <div className="flex items-center gap-2 pb-2">
                                {['ALL', '美图秀秀', '美颜', 'wink'].map(app => (
                                    <button
                                        key={app}
                                        onClick={() => setFilterApp(app)}
                                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${filterApp === app
                                            ? 'bg-indigo-600 text-white shadow-indigo-500/30 shadow-md'
                                            : 'bg-white text-slate-500 hover:bg-slate-100'
                                            }`}
                                    >
                                        {app === 'ALL' ? '全部' : app}
                                    </button>
                                ))}
                            </div>

                            {/* Templates Row Layout */}
                            <div className="flex flex-col gap-4 pb-20 px-2">
                                {filteredTemplates.map(tpl => {
                                    const duplicate = isDuplicate(tpl);
                                    const isDisabled = tpl.app === '美颜' || tpl.app === 'wink';
                                    return (
                                        <div
                                            key={tpl.id}
                                            draggable={!isDisabled}
                                            onDragStart={(e) => !isDisabled && handleDragStart(e, tpl.id)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => !isDisabled && handleDrop(e, tpl.id)}
                                            className={`bg-white rounded-xl border shadow-sm flex items-center gap-4 p-3 pr-6 relative group transition-all duration-200
                                                ${duplicate ? 'border-red-300 bg-red-50/10' : isDisabled ? 'border-slate-100 bg-slate-50 opacity-60 grayscale' : 'border-slate-100 hover:border-indigo-200'}
                                                ${draggedId === tpl.id ? 'opacity-40 border-dashed border-indigo-400' : ''}
                                            `}
                                        >
                                            {/* Disabled Overlay */}
                                            {isDisabled && <div className="absolute inset-0 z-20 cursor-not-allowed" title="该应用暂不支持配置"></div>}

                                            {/* Duplicate Warning Indicator */}
                                            {duplicate && (
                                                <div className="absolute top-0 left-0 bg-red-500 text-white text-[10px] px-1.5 rounded-br-lg z-10" title="重复配置">
                                                    !
                                                </div>
                                            )}

                                            {/* 1. Drag Handle & App Badge */}
                                            <div className="flex items-center gap-3 pl-2">
                                                <span className="material-symbols-outlined text-slate-300 cursor-move hover:text-indigo-400" title="Drag to reorder">drag_indicator</span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${tpl.app === '美图秀秀' ? 'bg-pink-50 text-pink-600 border-pink-100' :
                                                    tpl.app === '美颜' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                        'bg-purple-50 text-purple-600 border-purple-100'
                                                    }`}>
                                                    {tpl.app}
                                                </span>
                                            </div>

                                            {/* 2. Name & Category */}
                                            <div className="flex flex-col gap-1 w-48">
                                                <input
                                                    className="bg-transparent border-none p-0 text-sm font-bold text-slate-800 focus:ring-0 w-full hover:text-indigo-600 transition-colors"
                                                    defaultValue={tpl.name}
                                                    onBlur={(e) => handleUpdateField(tpl.id, 'name', e.target.value)}
                                                    placeholder="模板名称"
                                                />
                                                <div className="flex items-center gap-2">
                                                    <div className="text-[10px] text-slate-500 bg-slate-100 px-1.5 rounded flex items-center gap-1">
                                                        <span className="w-1 h-1 rounded-full bg-slate-400"></span>
                                                        {tpl.category}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 3. Dimensions */}
                                            <div className="w-24">
                                                <label className="text-[9px] text-slate-400 block mb-0.5 uppercase">尺寸</label>
                                                <input
                                                    className="w-full bg-slate-50 border-slate-100 rounded px-2 py-1 text-xs font-mono text-slate-600 focus:ring-1 focus:ring-indigo-500 border-none"
                                                    defaultValue={tpl.dimensions || ''}
                                                    onBlur={(e) => handleUpdateField(tpl.id, 'dimensions', e.target.value)}
                                                    placeholder="W x H"
                                                />
                                            </div>

                                            {/* Divider */}
                                            <div className="h-8 w-[1px] bg-slate-100"></div>

                                            {/* 4. Assets (Inline) */}
                                            <div className="flex items-center gap-3 flex-1">
                                                {/* Asset: Mask */}
                                                <div className="relative group/asset">
                                                    <div className="w-10 h-10 rounded border border-slate-100 bg-slate-50 overflow-hidden flex items-center justify-center relative hover:border-indigo-200 transition-colors">
                                                        {tpl.mask_path ? (
                                                            <img src={`${ASSETS_URL}${tpl.mask_path}?v=${assetsVersion}`} className="w-full h-full object-contain" alt="Mask" />
                                                        ) : (
                                                            <span className="material-symbols-outlined text-slate-300 text-sm">texture</span>
                                                        )}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                                            onChange={(e) => e.target.files?.[0] && handleMaskUpload(tpl.id, e.target.files[0])}
                                                            title="Upload Mask"
                                                        />
                                                    </div>
                                                    <span className="text-[9px] text-slate-400 text-center block w-full mt-0.5">蒙版</span>
                                                </div>

                                                {/* Asset: Crop (Splash Only) */}
                                                {(tpl.category === '开屏') && (
                                                    <div className="relative group/asset">
                                                        <div className="w-10 h-10 rounded border border-slate-100 bg-slate-50 overflow-hidden flex items-center justify-center relative hover:border-indigo-200 transition-colors">
                                                            {tpl.crop_overlay_path ? (
                                                                <img src={`${ASSETS_URL}${tpl.crop_overlay_path}?v=${assetsVersion}`} className="w-full h-full object-contain" alt="Crop" />
                                                            ) : (
                                                                <span className="material-symbols-outlined text-slate-300 text-sm">crop</span>
                                                            )}
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                                onChange={(e) => e.target.files?.[0] && handleCropOverlayUpload(tpl.id, e.target.files[0])}
                                                                title="Upload Crop Overlay"
                                                            />
                                                        </div>
                                                        <span className="text-[9px] text-slate-400 text-center block w-full mt-0.5">裁剪</span>
                                                    </div>
                                                )}

                                                {/* Asset: Badge (Focal or icon/banner or 弹窗) */}
                                                {(tpl.category === '焦点视窗' || tpl.category === 'icon/banner' || tpl.category === '弹窗') && (
                                                    <div className="relative group/asset">
                                                        <div className="w-10 h-10 rounded border border-slate-100 bg-slate-50 overflow-hidden flex items-center justify-center relative hover:border-indigo-200 transition-colors">
                                                            {tpl.badge_overlay_path ? (
                                                                <img src={`${ASSETS_URL}${tpl.badge_overlay_path}?v=${assetsVersion}`} className="w-full h-full object-contain" alt="Badge" />
                                                            ) : (
                                                                <span className="material-symbols-outlined text-slate-300 text-sm">verified</span>
                                                            )}
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                                onChange={(e) => e.target.files?.[0] && handleBadgeOverlayUpload(tpl.id, e.target.files[0])}
                                                                title="Upload Badge"
                                                            />
                                                        </div>
                                                        <span className="text-[9px] text-slate-400 text-center block w-full mt-0.5">角标</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* 5. Workflow */}
                                            <div className="w-48">
                                                <label className="text-[9px] text-slate-400 block mb-0.5 uppercase">ComfyUI 工作流</label>
                                                <select
                                                    className="w-full bg-slate-50 border-none rounded text-xs text-slate-600 focus:ring-1 focus:ring-indigo-500 py-1 pl-2 pr-6 cursor-pointer hover:bg-slate-100 transition-colors"
                                                    value={tpl.workflow_id || ''}
                                                    onChange={(e) => handleUpdateField(tpl.id, 'workflow_id', e.target.value)}
                                                >
                                                    <option value="">选择工作流...</option>
                                                    {workflows.map(wf => (
                                                        <option key={wf.id} value={wf.id}>{wf.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* 6. Delete Action */}
                                            <button
                                                onClick={() => handleDeleteTemplate(tpl.id)}
                                                className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all active:scale-90 ml-auto"
                                                title="Delete Template"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8 max-w-[1400px] mx-auto">
                            {/* Premium Upload Zone */}
                            <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/10 transition-all duration-300 cursor-pointer relative group overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/0 to-indigo-50/0 group-hover:from-indigo-50/20 group-hover:to-purple-50/20 transition-all duration-500"></div>
                                <input
                                    type="file"
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                    accept=".json"
                                    onChange={(e) => e.target.files?.[0] && handleWorkflowUpload(e.target.files[0])}
                                />
                                <div className="flex flex-col items-center justify-center relative z-20">
                                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                        <span className="material-symbols-outlined text-5xl text-indigo-500">cloud_upload</span>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-700 mb-2">点击上传 ComfyUI 工作流</h3>
                                    <p className="text-sm font-medium text-slate-400">支持 .json 格式的标准工作流文件</p>
                                </div>
                            </div>

                            {/* Workflows Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {workflows.map(w => (
                                    <div key={w.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full group">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                                                    <span className="material-symbols-outlined text-purple-600">account_tree</span>
                                                </div>
                                                <h3 className="font-bold text-slate-800 text-sm truncate">{w.name}</h3>
                                            </div>
                                            <span className="bg-emerald-50 text-emerald-600 text-[10px] px-2.5 py-1 rounded-md font-black shadow-sm">v{w.version}</span>
                                        </div>

                                        <div className="bg-slate-900 rounded-xl p-4 flex-1 mb-4 overflow-hidden relative group-code">
                                            <div className="absolute top-2 right-2 text-[10px] text-slate-500 font-mono">JSON</div>
                                            <pre className="text-[10px] text-slate-400 font-mono overflow-hidden h-32 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">
                                                {JSON.stringify(w.content, null, 2)}
                                            </pre>
                                            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-900 to-transparent"></div>
                                        </div>

                                        <div className="flex justify-between items-center pt-2">
                                            <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">calendar_today</span>
                                                {new Date(w.created_at).toLocaleDateString()}
                                            </div>
                                            <button className="text-slate-300 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-full">
                                                <span className="material-symbols-outlined text-lg">download</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div >
            </div >

            {/* Premium Image Preview Modal */}
            {
                previewImage && (
                    <div
                        className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300"
                        onClick={() => setPreviewImage(null)}
                    >
                        <button
                            onClick={() => setPreviewImage(null)}
                            className="absolute top-8 right-8 text-white/50 hover:text-white transition-all hover:rotate-90 duration-300 bg-white/10 hover:bg-white/20 p-3 rounded-full backdrop-blur-md"
                        >
                            <span className="material-symbols-outlined text-3xl">close</span>
                        </button>
                        <div
                            className="relative max-w-5xl max-h-[85vh] rounded-3xl overflow-hidden shadow-2xl ring-4 ring-white/10"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="absolute inset-0 bg-chess-pattern opacity-20 pointer-events-none"></div>
                            <img
                                src={previewImage}
                                className="w-full h-full object-contain relative z-10"
                                alt="Preview"
                            />
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AdminDashboard;
