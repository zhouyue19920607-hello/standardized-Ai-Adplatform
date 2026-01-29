import React, { useState, useEffect } from 'react';
import { AdTemplate, AdAsset } from '../types';
import { getTemplates, updateTemplate, uploadMask, getWorkflows, uploadWorkflow, ASSETS_URL, createTemplate, deleteTemplate } from '../services/api';

interface AdminDashboardProps {
    onClose: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState<'templates' | 'workflows'>('templates');
    const [templates, setTemplates] = useState<AdTemplate[]>([]);
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

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
            const t = await createTemplate({ ...newTemplate, checked: false });
            setTemplates(prev => [...prev, t]);
            setNewTemplate({ name: '', app: '美图秀秀', category: '开屏', dimensions: '1080 x 1920' });
        } catch (error) {
            console.error("Failed to create template", error);
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        if (!window.confirm("确定删除该模版吗？")) return;
        try {
            await deleteTemplate(id);
            setTemplates(prev => prev.filter(t => t.id !== id));
        } catch (error) {
            console.error("Failed to delete template", error);
        }
    };

    const handleUpdateField = async (id: string, field: string, value: string) => {
        try {
            await updateTemplate(id, { [field]: value });
            setTemplates(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
        } catch (error) {
            console.error(`Failed to update ${field}`, error);
        }
    };

    const handleMaskUpload = async (id: string, file: File) => {
        try {
            const { mask_path } = await uploadMask(id, file);
            setTemplates(prev => prev.map(t => t.id === id ? { ...t, mask_path } : t));
        } catch (error) {
            console.error("Failed to upload mask", error);
        }
    };

    const handleWorkflowUpload = async (file: File) => {
        try {
            await uploadWorkflow(file);
            fetchData();
        } catch (error) {
            console.error("Failed to upload workflow", error);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-7xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <div className="flex gap-4">
                        <h2 className="text-xl font-bold">管理后台</h2>
                        <div className="flex bg-slate-200 rounded-lg p-1">
                            <button
                                onClick={() => setActiveTab('templates')}
                                className={`px-4 py-1 rounded-md text-sm font-bold transition-all ${activeTab === 'templates' ? 'bg-white shadow-sm text-primary' : 'text-slate-500'}`}
                            >
                                模板管理
                            </button>
                            <button
                                onClick={() => setActiveTab('workflows')}
                                className={`px-4 py-1 rounded-md text-sm font-bold transition-all ${activeTab === 'workflows' ? 'bg-white shadow-sm text-primary' : 'text-slate-500'}`}
                            >
                                ComfyUI工作流
                            </button>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
                    {activeTab === 'templates' ? (
                        <div className="space-y-6">
                            {/* Create Form */}
                            <form onSubmit={handleCreateTemplate} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-5 gap-4 items-end">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1">模版名称</label>
                                    <input
                                        required
                                        className="border border-slate-200 rounded px-3 py-2 text-sm w-full"
                                        placeholder="例如：618大促开屏"
                                        value={newTemplate.name}
                                        onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1">所属App</label>
                                    <select
                                        className="border border-slate-200 rounded px-3 py-2 text-sm w-full"
                                        value={newTemplate.app}
                                        onChange={(e) => setNewTemplate(prev => ({ ...prev, app: e.target.value }))}
                                    >
                                        <option>美图秀秀</option>
                                        <option>美颜</option>
                                        <option>wink</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1">模版分类</label>
                                    <select
                                        className="border border-slate-200 rounded px-3 py-2 text-sm w-full"
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
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1">设计尺寸</label>
                                    <input
                                        className="border border-slate-200 rounded px-3 py-2 text-sm w-full"
                                        placeholder="1080 x 1920"
                                        value={newTemplate.dimensions}
                                        onChange={(e) => setNewTemplate(prev => ({ ...prev, dimensions: e.target.value }))}
                                    />
                                </div>
                                <button type="submit" className="bg-primary text-white h-[38px] rounded-lg font-bold text-sm hover:bg-primary-dark transition-colors">
                                    + 新增模版
                                </button>
                            </form>

                            {/* Templates List */}
                            <div className="grid grid-cols-1 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-12 gap-4 font-bold text-slate-500 text-[10px] uppercase">
                                    <div className="col-span-2">App / Category</div>
                                    <div className="col-span-2">Name</div>
                                    <div className="col-span-2">Dimensions</div>
                                    <div className="col-span-2">Binding Workflow</div>
                                    <div className="col-span-2">Mask</div>
                                    <div className="col-span-2 text-right">Action</div>
                                </div>
                                {templates.map(t => (
                                    <div key={t.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-12 gap-4 items-center">
                                        <div className="col-span-2">
                                            <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold mr-2">{t.app}</span>
                                            <span className="text-xs text-slate-500">{t.category}</span>
                                        </div>
                                        <div className="col-span-2 font-medium text-slate-700">
                                            <input
                                                className="border-none focus:ring-1 ring-slate-200 rounded px-1 py-1 text-sm w-full"
                                                defaultValue={t.name}
                                                onBlur={(e) => handleUpdateField(t.id, 'name', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <input
                                                className="border border-slate-200 rounded px-2 py-1 text-xs w-full"
                                                defaultValue={t.dimensions || ''}
                                                onBlur={(e) => handleUpdateField(t.id, 'dimensions', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <select
                                                className="border border-slate-200 rounded px-2 py-1 text-xs w-full bg-slate-50"
                                                value={t.workflow_id || ''}
                                                onChange={(e) => handleUpdateField(t.id, 'workflow_id', e.target.value)}
                                            >
                                                <option value="">未绑定工作流</option>
                                                {workflows.map(w => (
                                                    <option key={w.id} value={w.id}>{w.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="flex items-center gap-2">
                                                {t.mask_path ? (
                                                    <img src={`${ASSETS_URL}${t.mask_path}`} className="w-8 h-8 rounded border bg-chess-pattern" />
                                                ) : (
                                                    <span className="text-[10px] text-slate-300">无遮罩</span>
                                                )}
                                                <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 p-1.5 rounded transition-colors">
                                                    <input type="file" className="hidden" accept="image/png" onChange={(e) => e.target.files?.[0] && handleMaskUpload(t.id, e.target.files[0])} />
                                                    <span className="material-symbols-outlined text-sm">upload</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div className="col-span-2 text-right">
                                            <button
                                                onClick={() => handleDeleteTemplate(t.id)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="bg-white p-6 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 hover:border-primary transition-colors cursor-pointer relative">
                                <input
                                    type="file"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    accept=".json"
                                    onChange={(e) => e.target.files?.[0] && handleWorkflowUpload(e.target.files[0])}
                                />
                                <span className="material-symbols-outlined text-4xl text-slate-300">upload_file</span>
                                <span className="text-slate-500 font-bold">点击上传 ComfyUI 工作流 (JSON)</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {workflows.map(w => (
                                    <div key={w.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-bold text-slate-800">{w.name}</h3>
                                            <span className="bg-green-100 text-green-800 text-[10px] px-2 py-0.5 rounded-full">v{w.version}</span>
                                        </div>
                                        <pre className="bg-slate-50 p-2 rounded text-[10px] text-slate-500 overflow-hidden h-24 mb-2">
                                            {JSON.stringify(w.content, null, 2)}
                                        </pre>
                                        <div className="text-[10px] text-slate-400">
                                            Created: {new Date(w.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
