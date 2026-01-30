import React, { useState, useRef, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import PreviewGrid from './components/PreviewGrid';
import Footer from './components/Footer';
import { AdTemplate, AdAsset, AdConfig } from './types';
import { analyzeImageColors } from './geminiService';
import { getTemplates } from './services/api';
import AdminDashboard from './components/AdminDashboard';
import { extractSmartColor } from './utils/smartColor';

interface RawFile {
  id: string;
  file: File;
  previewUrl: string;
}

const App: React.FC = () => {
  const [templates, setTemplates] = useState<AdTemplate[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await getTemplates();
      setTemplates(data.map(t => ({ ...t, checked: false })));
    } catch (error) {
      console.error("Failed to load templates", error);
    }
  };
  const [config, setConfig] = useState<AdConfig>({
    smartExtract: true,
    iconColor: '#FF00FF',
    gradientColor: '#FF00FF',
    showMask: false,
    splashText: '跳转至第三方平台',
  });
  const [rawFiles, setRawFiles] = useState<RawFile[]>([]);
  const [processedAssets, setProcessedAssets] = useState<AdAsset[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTemplateToggle = (id: string) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, checked: !t.checked } : t));
  };

  const handleConfigChange = (newConfig: Partial<AdConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newRawFiles: RawFile[] = Array.from(files).map((file: File) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      previewUrl: URL.createObjectURL(file as any),
    }));

    setRawFiles(prev => [...prev, ...newRawFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeRawFile = (id: string) => {
    setRawFiles(prev => {
      const filtered = prev.filter(f => f.id !== id);
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove) URL.revokeObjectURL(fileToRemove.previewUrl);
      return filtered;
    });
  };

  const handleGenerate = async () => {
    const activeTemplates = templates.filter(t => t.checked);
    if (rawFiles.length === 0 || activeTemplates.length === 0) return;

    setIsProcessing(true);
    setProcessedAssets([]);

    const results: AdAsset[] = [];


    for (const raw of rawFiles) {
      // 获取图片的 DataURL
      const previewUrl = raw.previewUrl;

      const analysis = config.smartExtract
        ? await extractSmartColor(previewUrl)
        : { hexColor: config.iconColor };

      activeTemplates.forEach(template => {
        if (analysis.hexColor) {
          console.log(`[ColorAnalysis] Extracted color for ${raw.file.name}: ${analysis.hexColor} (HCL Corrected)`);
        }
        results.push({
          id: `${raw.id}-${template.id}`,
          url: raw.previewUrl,
          name: raw.file.name,
          size: `${Math.round(raw.file.size / 1024)}k`,
          isCompressed: true,
          type: raw.file.type,
          category: template.category,
          app: template.app,
          templateName: template.name,
          aiExtractedColor: analysis.hexColor,
          dimensions: template.dimensions || '1080 x 1920',
          splashText: template.category === '开屏' ? config.splashText : undefined,
          maskUrl: template.mask_path,
        });
      });
    }

    // 生成后自动开启遮罩预览 (如果包含焦点视窗)
    const hasFocalWindow = activeTemplates.some(t => t.category === '焦点视窗');
    if (hasFocalWindow) {
      handleConfigChange({ showMask: true });
    }

    setProcessedAssets(results);
    setIsProcessing(false);
  };

  const clearAll = () => {
    rawFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
    setRawFiles([]);
    setProcessedAssets([]);
  };

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg">
      <Header />

      <main className="flex-1 max-w-[1600px] mx-auto w-full flex overflow-hidden">
        <Sidebar
          templates={templates}
          config={config}
          onTemplateToggle={handleTemplateToggle}
          onConfigChange={handleConfigChange}
          activeCount={rawFiles.length}
          onGenerate={handleGenerate}
          isProcessing={isProcessing}
        />

        <div className="flex-1 flex flex-col bg-slate-50/30 overflow-hidden h-[calc(100vh-73px)] sticky top-[73px]">
          {/* Raw Assets & Upload Section */}
          <section className="p-6 shrink-0 bg-white border-b border-slate-200 overflow-y-auto max-h-[40%] custom-scrollbar">
            {rawFiles.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group relative flex flex-col items-center justify-center border-2 border-dashed border-slate-300 bg-white hover:border-primary hover:bg-blue-50/30 rounded-2xl p-12 transition-all cursor-pointer"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.mp4"
                  onChange={handleFileUpload}
                />
                <div className="mb-4 h-14 w-14 bg-blue-50 rounded-full flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl">cloud_upload</span>
                </div>
                <h3 className="text-base font-bold text-slate-800">上传原始资产素材</h3>
                <p className="text-slate-400 text-xs mt-2">支持 JPG, PNG, MP4, WEBP | 无尺寸限制</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-700">待处理素材 ({rawFiles.length})</h3>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[11px] font-bold text-primary hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                    >
                      + 继续添加
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp,.mp4"
                      onChange={handleFileUpload}
                    />
                  </div>
                  <button onClick={clearAll} className="text-[11px] text-red-500 font-bold hover:underline">移除全部</button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {rawFiles.map(raw => (
                    <div key={raw.id} className="relative group rounded-xl border border-slate-200 overflow-hidden bg-slate-100 shadow-sm hover:ring-2 ring-primary/20 transition-all">
                      <div className="relative">
                        {raw.file.type.startsWith('video/') ? (
                          <div className="w-full h-auto max-h-48 aspect-video flex items-center justify-center bg-slate-900 text-white">
                            <span className="material-symbols-outlined text-3xl">play_circle</span>
                          </div>
                        ) : (
                          <img
                            src={raw.previewUrl}
                            className="w-full h-auto max-h-48 object-contain bg-slate-200"
                            alt="raw"
                          />
                        )}
                        <button
                          onClick={() => removeRawFile(raw.id)}
                          className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      </div>
                      <div className="p-2 bg-white">
                        <p className="text-[10px] text-slate-500 truncate font-medium">{raw.file.name}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{Math.round(raw.file.size / 1024)} KB</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Processed Previews Section */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <PreviewGrid
              assets={processedAssets}
              config={config}
              onClear={() => setProcessedAssets([])}
              onToggleMask={() => handleConfigChange({ showMask: !config.showMask })}
              isGenerating={isProcessing}
            />
          </div>
        </div>
      </main>

      <Footer
        selectedCount={templates.filter(t => t.checked).length}
        assetCount={processedAssets.length}
      />

      {/* Admin Toggle */}
      <button
        onClick={() => setShowAdmin(true)}
        className="fixed bottom-4 right-4 bg-slate-800 text-white p-3 rounded-full shadow-lg hover:bg-slate-700 transition-colors z-40"
      >
        <span className="material-symbols-outlined">settings</span>
      </button>

      {showAdmin && <AdminDashboard onClose={() => { setShowAdmin(false); loadTemplates(); }} />}
    </div>
  );
};

export default App;
