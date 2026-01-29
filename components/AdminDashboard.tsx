import React, { useState, useEffect } from 'react';
import { AdTemplate, AdAsset } from '../types';
import { getTemplates, updateTemplate, uploadMask, getWorkflows, uploadWorkflow } from '../services/api';

interface AdminDashboardProps {
    onClose: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState<'templates' | 'workflows'>('templates');
    const [templates, setTemplates] = useState<AdTemplate[]>([]);
    const [workflows, setWorkflows] = useState<any[]>([]); // simplified type
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'templates') {
                const data = await getTemplates();
                setTemplates(data);
            } else {
                const data = await getWorkflows();
                setWorkflows(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDimensionsChange = async (id: string, newDim: string) => {
        try {
            await updateTemplate(id, { dimensions: newDim });
            setTemplates(prev => prev.map(t => t.id === id ? { ...t, dimensions: newDim } : t));
        } catch (error) {
            console.error("Failed to update dimensions", error);
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
            fetchData(); // refresh
        } catch (error) {
            console.error("Failed to upload workflow", error);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-10">
            <div className="bg-white rounded-2xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
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
                    {loading ? (
                        <div className="flex justify-center items-center h-full">加载中...</div>
                    ) : activeTab === 'templates' ? (
                        <div className="grid grid-cols-1 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-12 gap-4 font-bold text-slate-500 text-xs uppercase">
                                <div className="col-span-2">App / Category</div>
                                <div className="col-span-3">Name</div>
                                <div className="col-span-2">Dimensions</div>
                                <div className="col-span-2">Mask</div>
                                <div className="col-span-3">Action</div>
                            </div>
                            {templates.map(t => (
                                <div key={t.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-12 gap-4 items-center">
                                    <div className="col-span-2">
                                        <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold mr-2">{t.app}</span>
                                        <span className="text-xs text-slate-500">{t.category}</span>
                                    </div>
                                    <div className="col-span-3 font-medium text-slate-700">{t.name}</div>
                                    <div className="col-span-2">
                                        <input
                                            className="border border-slate-300 rounded px-2 py-1 text-xs w-full"
                                            defaultValue={t.dimensions || ''}
                                            onBlur={(e) => handleDimensionsChange(t.id, e.target.value)}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <div className="flex items-center gap-2">
                                            {t.mask_path ? (
                                                <img src={`http://localhost:8000${t.mask_path}`} className="w-8 h-8 rounded border bg-chess-pattern" />
                                            ) : (
                                                <span className="text-[10px] text-slate-300">无遮罩</span>
                                            )}
                                            <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 p-1.5 rounded transition-colors">
                                                <input type="file" className="hidden" accept="image/png" onChange={(e) => e.target.files?.[0] && handleMaskUpload(t.id, e.target.files[0])} />
                                                <span className="material-symbols-outlined text-sm">upload</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="col-span-3 text-xs text-slate-400">
                                        ID: {t.id}
                                    </div>
                                </div>
                            ))}
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
