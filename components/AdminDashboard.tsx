import React, { useState, useEffect, useRef } from 'react';
import { AdTemplate, AdAsset } from '../types';
import { getTemplates, updateTemplate, uploadMask, uploadCropOverlay, uploadBadgeOverlay, getWorkflows, uploadWorkflow, ASSETS_URL, createTemplate, deleteTemplate, smartCropImage, reorderTemplates, getSettings, updateSettings, testTongyiConnection, testRoboneoConnection, testNanobannerConnection, SystemSettings } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

interface AdminDashboardProps {
    onClose: () => void;
}

const PROMPT_PRESETS = [
    { label: '广告摄影', value: '专业广告摄影风格，画面延伸自然，背景与主体融合协调，高清细腻' },
    { label: '纯色简约', value: '纯色高级背景，极简现代设计风格，干净整洁，专业质感' },
    { label: '渐变时尚', value: '流行时尚风格，柔和渐变背景，光线优雅，高端品牌感' },
    { label: '自然户外', value: '自然光线，户外场景延伸，阳光明媚，清新自然' },
    { label: '商务办公', value: '商务风格，简洁干净的办公环境，专业正式' },
];

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<'templates' | 'workflows' | 'settings'>('templates');
    const [templates, setTemplates] = useState<AdTemplate[]>([]);
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [assetsVersion, setAssetsVersion] = useState(Date.now());

    // AI 增强设置 State
    const [aiSettings, setAiSettings] = useState<SystemSettings>({
        aiEnhancedMode: false,
        aiProvider: 'tongyi',
        tongyiApiKey: '',
        roboneoApiKey: '',
        roboneoApiSecret: '',
        nanobannerApiKey: '',
        nanobannerBaseUrl: '',
        comfyuiUrl: 'http://127.0.0.1:8188'
    });
    const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
    const [aiSettingsSaved, setAiSettingsSaved] = useState(false);
    // NOTE: 连接测试状态：idle 未测试，testing 测试中，success 成功，error 失败
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState<string>('');

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

    useEffect(() => {
        // NOTE: 首次加载时拉取 AI 增强设置
        getSettings().then(s => setAiSettings(s)).catch(console.error);
    }, []);

    const handleSaveAiSettings = async () => {
        setAiSettingsSaving(true);
        try {
            await updateSettings(aiSettings);
            setAiSettingsSaved(true);
            setTimeout(() => setAiSettingsSaved(false), 2000);
        } catch (err) {
            console.error('Failed to save AI settings', err);
            alert('保存失败，请重试');
        } finally {
            setAiSettingsSaving(false);
        }
    };

    /**
     * 测试通义万象 API Key 连通性
     * NOTE: 调用 /api/tongyi/test，使用获取上传凭证接口验证 key，无计费
     */
    const handleTestConnection = async () => {
        setTestStatus('testing');
        setTestMessage('');
        try {
            if (aiSettings.aiProvider === 'tongyi') {
                // 优先使用当前输入框中的 key（未保存的），其次使用已配置的
                const keyToTest = aiSettings.tongyiApiKey && aiSettings.tongyiApiKey !== '***configured***'
                    ? aiSettings.tongyiApiKey
                    : undefined;
                const result = await testTongyiConnection(keyToTest);
                if (result.ok) {
                    setTestStatus('success');
                    setTestMessage(result.quota ? `${result.message}（${result.quota}）` : (result.message || '连接成功'));
                } else {
                    setTestStatus('error');
                    setTestMessage(result.error || '连接失败');
                }
            } else if (aiSettings.aiProvider === 'roboneo') {
                const keyToTest = aiSettings.roboneoApiKey && aiSettings.roboneoApiKey !== '***configured***'
                    ? aiSettings.roboneoApiKey
                    : undefined;
                const secretToTest = aiSettings.roboneoApiSecret && aiSettings.roboneoApiSecret !== '***configured***'
                    ? aiSettings.roboneoApiSecret
                    : undefined;

                const result = await testRoboneoConnection(keyToTest, secretToTest);
                if (result.ok) {
                    setTestStatus('success');
                    setTestMessage(result.message || '连接成功');
                } else {
                    setTestStatus('error');
                    setTestMessage(result.error || '连接失败');
                }
            } else if (aiSettings.aiProvider === 'nanobanner') {
                const idToTest = aiSettings.nanobannerApiKey && aiSettings.nanobannerApiKey !== '***configured***'
                    ? aiSettings.nanobannerApiKey
                    : undefined;
                const secretToTest = aiSettings.nanobannerBaseUrl && aiSettings.nanobannerBaseUrl !== '***configured***'
                    ? aiSettings.nanobannerBaseUrl
                    : undefined;

                const result = await testNanobannerConnection(idToTest, secretToTest);
                if (result.ok) {
                    setTestStatus('success');
                    setTestMessage(result.message || '连接成功');
                } else {
                    setTestStatus('error');
                    setTestMessage(result.error || '连接失败');

                }
            } else {
                setTestStatus('error');
                setTestMessage('当前服务商暂不支持测试');
            }
        } catch (err: any) {
            setTestStatus('error');
            const msg = err?.response?.data?.error || err.message || '未知错误';
            setTestMessage(msg);
        }
    };

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
                                onClick={() => setActiveTab('settings')}
                                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-1.5 ${activeTab === 'settings' ? 'bg-white shadow-md text-slate-900 scale-[1.02]' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                                AI 增强
                            </button>
                            {/* NOTE: 工作流管理仅在 AI 增强模式选择了 ComfyUI 时才激活 */}
                            <button
                                onClick={() => aiSettings.aiProvider === 'comfyui' && setActiveTab('workflows')}
                                disabled={aiSettings.aiProvider !== 'comfyui'}
                                title={aiSettings.aiProvider !== 'comfyui' ? '请先在 AI 增强设置中选择「自建 ComfyUI」' : undefined}
                                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-1.5 ${aiSettings.aiProvider !== 'comfyui'
                                    ? 'text-slate-300 cursor-not-allowed'
                                    : activeTab === 'workflows' ? 'bg-white shadow-md text-slate-900 scale-[1.02]' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[16px]">account_tree</span>
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
                                                <option value="wink">wink</option>
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
                                    // NOTE: 美颜/wink 开屏模板允许上传蒙版（三平台开屏功能需要），仅其他美颜模板保持禁用
                                    const isDisabled = tpl.app === '美颜' && tpl.category !== '开屏';
                                    // NOTE: 允许美颜/wink 开屏模板操作蒙版，但禁止其他字段编辑
                                    const isMaskOnlyEditable = (tpl.app === '美颜' || tpl.app === 'wink') && tpl.category === '开屏';
                                    return (
                                        <div
                                            key={tpl.id}
                                            draggable={!isDisabled && !isMaskOnlyEditable}
                                            onDragStart={(e) => !isDisabled && !isMaskOnlyEditable && handleDragStart(e, tpl.id)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => !isDisabled && !isMaskOnlyEditable && handleDrop(e, tpl.id)}
                                            className={`bg-white rounded-xl border shadow-sm flex items-center gap-4 p-3 pr-6 relative group transition-all duration-200
                                                ${duplicate ? 'border-red-300 bg-red-50/10' : isDisabled ? 'border-slate-100 bg-slate-50 opacity-60 grayscale' : isMaskOnlyEditable ? 'border-blue-100 bg-blue-50/30' : 'border-slate-100 hover:border-indigo-200'}
                                                ${draggedId === tpl.id ? 'opacity-40 border-dashed border-indigo-400' : ''}
                                            `}
                                        >
                                            {/* Disabled Overlay */}
                                            {isDisabled && <div className="absolute inset-0 z-20 cursor-not-allowed" title="该应用暂不支持配置"></div>}
                                            {/* Mask-only overlay: block clicks except on mask upload */}
                                            {isMaskOnlyEditable && <div className="absolute inset-0 z-10 cursor-default pointer-events-none" />}

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
                                                    <div className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 rounded flex items-center gap-1 font-medium" title="累积处理图片数">
                                                        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>photo_library</span>
                                                        {tpl.processedCount || 0}
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
                                                        {/* NOTE: isMaskOnlyEditable 时使用 z-30 突破覆盖层，允许上传 */}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className={`absolute inset-0 opacity-0 cursor-pointer ${isMaskOnlyEditable ? 'z-30' : ''}`}
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

                                                {/* Asset: Badge (Focal or icon/banner or 弹窗 or 信息流) */}
                                                {(tpl.category === '焦点视窗' || tpl.category === 'icon/banner' || tpl.category === '弹窗' || tpl.category === '信息流') && (
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
                    ) : null}

                    {/* Workflows Tab */}
                    {activeTab === 'workflows' && (
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

                    {/* AI Settings Tab */}
                    {activeTab === 'settings' && (
                        // NOTE: AI 增强模式设置面板
                        <div className="max-w-2xl mx-auto space-y-6">
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                                        <span className="material-symbols-outlined text-white text-xl">auto_awesome</span>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-slate-800">AI 图像增强模式</h3>
                                        <p className="text-xs text-slate-400 mt-0.5">开启后，上传图片将先经过 AI 服务智能扩展至模版尺寸，自动补充背景</p>
                                    </div>
                                </div>

                                {/* 主开关 */}
                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl mb-4">
                                    <div>
                                        <p className="text-sm font-bold text-slate-700">启用 AI 增强</p>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {aiSettings.aiEnhancedMode
                                                ? '✅ 已开启 — 图片将通过 AI 服务处理'
                                                : '⚪ 已关闭 — 使用常规智能裁剪'
                                            }
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={aiSettings.aiEnhancedMode}
                                            onChange={e => setAiSettings(prev => ({ ...prev, aiEnhancedMode: e.target.checked }))}
                                        />
                                        <div className="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600 transition-all"></div>
                                    </label>
                                </div>

                                {/* 服务商选择 */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">AI 服务商</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => setAiSettings(prev => ({ ...prev, aiProvider: 'tongyi' }))}
                                                className={`p-4 rounded-xl border-2 text-left transition-all ${aiSettings.aiProvider === 'tongyi'
                                                    ? 'border-violet-500 bg-violet-50'
                                                    : 'border-slate-200 hover:border-slate-300'
                                                    }`}
                                            >
                                                <p className="text-sm font-bold text-slate-800">阿里云通义万象</p>
                                                <p className="text-xs text-slate-400 mt-1">无需 GPU，按次计费</p>
                                                <p className="text-xs text-violet-500 font-bold mt-1">约 ¥0.14/张</p>
                                            </button>
                                            <button
                                                onClick={() => setAiSettings(prev => ({ ...prev, aiProvider: 'comfyui' }))}
                                                className={`p-4 rounded-xl border-2 text-left transition-all ${aiSettings.aiProvider === 'comfyui'
                                                    ? 'border-violet-500 bg-violet-50'
                                                    : 'border-slate-200 hover:border-slate-300'
                                                    }`}
                                            >
                                                <p className="text-sm font-bold text-slate-800">自建 ComfyUI</p>
                                                <p className="text-xs text-slate-400 mt-1">需要 GPU 服务器</p>
                                                <p className="text-xs text-slate-400 font-bold mt-1">（即将支持）</p>
                                            </button>
                                            <button
                                                onClick={() => setAiSettings(prev => ({ ...prev, aiProvider: 'roboneo' }))}
                                                className={`p-4 rounded-xl border-2 text-left transition-all ${aiSettings.aiProvider === 'roboneo'
                                                    ? 'border-fuchsia-500 bg-fuchsia-50'
                                                    : 'border-slate-200 hover:border-slate-300'
                                                    }`}
                                            >
                                                <p className="text-sm font-bold text-slate-800">美图 RoboNeo</p>
                                                <p className="text-xs text-slate-400 mt-1">美图自研图像大模型</p>
                                                <p className="text-xs text-fuchsia-500 font-bold mt-1">企业级 API</p>
                                            </button>
                                            <button
                                                onClick={() => setAiSettings(prev => ({ ...prev, aiProvider: 'nanobanner' }))}
                                                className={`p-4 rounded-xl border-2 text-left transition-all ${aiSettings.aiProvider === 'nanobanner'
                                                    ? 'border-red-500 bg-red-50'
                                                    : 'border-slate-200 hover:border-slate-300'
                                                    }`}
                                            >
                                                <p className="text-sm font-bold text-slate-800">Nano Banner API</p>
                                                <p className="text-xs text-slate-400 mt-1">兼容 OpenAI 接口</p>
                                                <p className="text-xs text-red-500 font-bold mt-1">Gemini Nano / 3.0 Pro</p>
                                            </button>
                                        </div>
                                    </div>

                                    {/* 通义万象 API Key */}
                                    {aiSettings.aiProvider === 'tongyi' && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                DashScope API Key
                                                <span className="ml-2 text-slate-300 normal-case font-normal">（阿里云控制台 → API-KEY）</span>
                                            </label>
                                            <input
                                                type="password"
                                                placeholder={aiSettings.tongyiApiKeyConfigured ? '已配置（输入新值可覆盖）' : 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'}
                                                value={aiSettings.tongyiApiKey === '***configured***' ? '' : aiSettings.tongyiApiKey}
                                                onChange={e => {
                                                    setAiSettings(prev => ({ ...prev, tongyiApiKey: e.target.value }));
                                                    // NOTE: key 变化时重置测试状态，避免显示旧结果
                                                    setTestStatus('idle');
                                                }}
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                                            />
                                            {aiSettings.tongyiApiKeyConfigured && aiSettings.tongyiApiKey !== '***configured***' && !aiSettings.tongyiApiKey && (
                                                <p className="text-xs text-green-500 mt-1.5 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                    API Key 已配置
                                                </p>
                                            )}

                                            {/* 测试连接按钮 */}
                                            <div className="mt-3 flex items-center gap-3">
                                                <button
                                                    onClick={handleTestConnection}
                                                    disabled={testStatus === 'testing' || (!aiSettings.tongyiApiKey && !aiSettings.tongyiApiKeyConfigured)}
                                                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {testStatus === 'testing' ? (
                                                        <><span className="material-symbols-outlined text-[14px] animate-spin">sync</span>测试中...</>
                                                    ) : (
                                                        <><span className="material-symbols-outlined text-[14px]">wifi</span>测试连接</>
                                                    )}
                                                </button>

                                                {/* 测试结果状态显示 */}
                                                {testStatus === 'success' && (
                                                    <span className="flex items-center gap-1 text-xs text-green-600 font-bold">
                                                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                        {testMessage}
                                                    </span>
                                                )}
                                                {testStatus === 'error' && (
                                                    <span className="flex items-center gap-1 text-xs text-red-500 font-bold">
                                                        <span className="material-symbols-outlined text-[14px]">error</span>
                                                        {testMessage}
                                                    </span>
                                                )}
                                            </div>

                                            {/* 扩图 Prompt 配置 */}
                                            <div className="mt-4">
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                    扩图 Prompt
                                                    <span className="ml-2 text-slate-300 normal-case font-normal">（引导 AI 生成扩展区域的背景风格）</span>
                                                </label>
                                                <textarea
                                                    rows={3}
                                                    placeholder="例如：专业广告摄影风格，画面延伸自然，背景与主体融合协调，高清细腻"
                                                    value={aiSettings.tongyiExpandPrompt ?? ''}
                                                    onChange={e => setAiSettings(prev => ({ ...prev, tongyiExpandPrompt: e.target.value }))}
                                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none leading-relaxed"
                                                />
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {PROMPT_PRESETS.map(preset => (
                                                        <button
                                                            key={preset.label}
                                                            onClick={() => setAiSettings(prev => ({ ...prev, tongyiExpandPrompt: preset.value }))}
                                                            className="px-3 py-1 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-full text-xs font-bold transition-colors border border-violet-200"
                                                        >
                                                            {preset.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="text-xs text-slate-400 mt-2">💡 Prompt 越具体，AI 生成的扩展背景越符合预期。建议描述场景氛围、色调、风格。</p>
                                            </div>
                                        </div>
                                    )}



                                    {/* ComfyUI 地址（占位，后续实现）*/}
                                    {aiSettings.aiProvider === 'comfyui' && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">ComfyUI 服务地址</label>
                                            <input
                                                type="text"
                                                placeholder="http://your-gpu-server:8188"
                                                value={aiSettings.comfyuiUrl}
                                                onChange={e => setAiSettings(prev => ({ ...prev, comfyuiUrl: e.target.value }))}
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                                            />
                                            <p className="text-xs text-amber-500 mt-1.5">⚠️ ComfyUI 集成即将推出，当前选择将在有 GPU 服务器后生效</p>
                                        </div>
                                    )}

                                    {/* 美图 RoboNeo 配置 */}
                                    {aiSettings.aiProvider === 'roboneo' && (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                    Meitu App Key
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder={aiSettings.roboneoApiKeyConfigured ? '已配置（输入新值可覆盖）' : '在此输入 App Key'}
                                                    value={aiSettings.roboneoApiKey === '***configured***' ? '' : aiSettings.roboneoApiKey}
                                                    onChange={e => {
                                                        setAiSettings(prev => ({ ...prev, roboneoApiKey: e.target.value }));
                                                        setTestStatus('idle');
                                                    }}
                                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                    Meitu App Secret
                                                </label>
                                                <input
                                                    type="password"
                                                    placeholder={aiSettings.roboneoApiKeyConfigured ? '已配置（输入新值可覆盖）' : '在此输入 App Secret'}
                                                    value={aiSettings.roboneoApiSecret === '***configured***' ? '' : aiSettings.roboneoApiSecret}
                                                    onChange={e => {
                                                        setAiSettings(prev => ({ ...prev, roboneoApiSecret: e.target.value }));
                                                        setTestStatus('idle');
                                                    }}
                                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 font-mono"
                                                />
                                            </div>

                                            {/* 测试连接按钮 */}
                                            <div className="mt-3 flex items-center gap-3">
                                                <button
                                                    onClick={handleTestConnection}
                                                    disabled={testStatus === 'testing' || (!aiSettings.roboneoApiKey && !aiSettings.roboneoApiKeyConfigured) || (!aiSettings.roboneoApiSecret && !aiSettings.roboneoApiKeyConfigured)}
                                                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {testStatus === 'testing' ? (
                                                        <><span className="material-symbols-outlined text-[14px] animate-spin">sync</span>测试中...</>
                                                    ) : (
                                                        <><span className="material-symbols-outlined text-[14px]">wifi</span>测试连接</>
                                                    )}
                                                </button>

                                                {/* 测试结果状态显示 */}
                                                {testStatus === 'success' && (
                                                    <span className="flex items-center gap-1 text-xs text-green-600 font-bold">
                                                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                        {testMessage}
                                                    </span>
                                                )}
                                                {testStatus === 'error' && (
                                                    <span className="flex items-center gap-1 text-xs text-red-500 font-bold">
                                                        <span className="material-symbols-outlined text-[14px]">error</span>
                                                        {testMessage}
                                                    </span>
                                                )}
                                            </div>

                                            {/* 扩图 Prompt 配置 */}
                                            <div className="mt-4">
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                    扩图 Prompt
                                                </label>
                                                <textarea
                                                    rows={3}
                                                    placeholder="例如：高级感背景，自然融合，高清细节"
                                                    value={aiSettings.tongyiExpandPrompt ?? ''}
                                                    onChange={e => setAiSettings(prev => ({ ...prev, tongyiExpandPrompt: e.target.value }))}
                                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 resize-none leading-relaxed"
                                                />
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {PROMPT_PRESETS.map(preset => (
                                                        <button
                                                            key={preset.label}
                                                            onClick={() => setAiSettings(prev => ({ ...prev, tongyiExpandPrompt: preset.value }))}
                                                            className="px-3 py-1 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-600 rounded-full text-xs font-bold transition-colors border border-fuchsia-200"
                                                        >
                                                            {preset.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Nano Banner 配置 */}
                                    {aiSettings.aiProvider === 'nanobanner' && (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                    Nano Banner API Key
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder={aiSettings.nanobannerApiKeyConfigured ? '已配置（输入新值可覆盖）' : '在此输入 API Key'}
                                                    value={aiSettings.nanobannerApiKey === '***configured***' ? '' : aiSettings.nanobannerApiKey}
                                                    onChange={e => {
                                                        setAiSettings(prev => ({ ...prev, nanobannerApiKey: e.target.value }));
                                                        setTestStatus('idle');
                                                    }}
                                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                    API Base URL (可选)
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder={'例如: https://api.openai.com/v1 或中转加速地址'}
                                                    value={aiSettings.nanobannerBaseUrl === '***configured***' ? '' : aiSettings.nanobannerBaseUrl}
                                                    onChange={e => {
                                                        setAiSettings(prev => ({ ...prev, nanobannerBaseUrl: e.target.value }));
                                                        setTestStatus('idle');
                                                    }}
                                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                                                />
                                            </div>

                                            {/* 测试连接按钮 */}
                                            <div className="mt-3 flex items-center gap-3">
                                                <button
                                                    onClick={handleTestConnection}
                                                    disabled={testStatus === 'testing' || (!aiSettings.nanobannerApiKey && !aiSettings.nanobannerApiKeyConfigured)}
                                                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {testStatus === 'testing' ? (
                                                        <><span className="material-symbols-outlined text-[14px] animate-spin">sync</span>测试中...</>
                                                    ) : (
                                                        <><span className="material-symbols-outlined text-[14px]">wifi</span>测试连接</>
                                                    )}
                                                </button>

                                                {/* 测试结果状态显示 */}
                                                {testStatus === 'success' && (
                                                    <span className="flex items-center gap-1 text-xs text-green-600 font-bold">
                                                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                        {testMessage}
                                                    </span>
                                                )}
                                                {testStatus === 'error' && (
                                                    <span className="flex items-center gap-1 text-xs text-red-500 font-bold">
                                                        <span className="material-symbols-outlined text-[14px]">error</span>
                                                        {testMessage}
                                                    </span>
                                                )}
                                            </div>

                                            {/* 扩图 Prompt 配置 */}
                                            <div className="mt-4">
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                    扩图 Prompt (建议英文)
                                                </label>
                                                <textarea
                                                    rows={3}
                                                    placeholder="例如：high quality background, natural fusion, photorealistic"
                                                    value={aiSettings.tongyiExpandPrompt ?? ''}
                                                    onChange={e => setAiSettings(prev => ({ ...prev, tongyiExpandPrompt: e.target.value }))}
                                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none leading-relaxed"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 保存按钮 */}
                                <button
                                    onClick={handleSaveAiSettings}
                                    disabled={aiSettingsSaving}
                                    className="mt-6 w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:brightness-110 text-white rounded-xl font-bold text-sm shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {aiSettingsSaving ? (
                                        <><span className="material-symbols-outlined text-lg animate-spin">sync</span>保存中...</>
                                    ) : aiSettingsSaved ? (
                                        <><span className="material-symbols-outlined text-lg">check_circle</span>已保存！</>
                                    ) : (
                                        <><span className="material-symbols-outlined text-lg">save</span>保存设置</>
                                    )}
                                </button>
                            </div>

                            {/* 说明卡片 */}
                            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 p-5 rounded-2xl">
                                <p className="text-xs font-bold text-violet-600 uppercase tracking-wider mb-3">💡 工作原理</p>
                                <ul className="space-y-2 text-xs text-slate-600">
                                    <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span>开关关闭时：图片经过常规智能裁剪（当前默认行为）</li>
                                    <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span>开关开启时：图片被发送给通义万象 AI，智能扩展并补充背景</li>
                                    <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span>AI 处理失败时自动降级到常规裁剪，不影响业务</li>
                                    <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span>每张开屏图预计费用约 ¥0.14，可在阿里云 DashScope 控制台查看用量</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                {/* Premium Image Preview Modal */}
                {previewImage && (
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
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;
