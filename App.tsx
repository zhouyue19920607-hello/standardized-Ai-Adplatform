import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import PreviewGrid from './components/PreviewGrid';
import Footer from './components/Footer';
import { AdTemplate, AdAsset, AdConfig, ColorScheme } from './types';
import { getTemplates, uploadRawAsset, generateComfyUI, ASSETS_URL, smartCropImage, incrementTemplateUsage } from './services/api';
import AdminDashboard from './components/AdminDashboard';
import { useLanguage } from './contexts/LanguageContext';
import { extractSmartColor, extractSmartPalette } from './utils/smartColor';
import { compositeAsset } from './utils/assetCompositor';

const HEADER_HEIGHT = 73;

interface RawFile {
  id: string;
  file: File;
  previewUrl: string;
  thumbnailUrl?: string; // 用于视频首帧截图
}

// 浏览器端视频截图辅助函数 - Safari 兼容版
const captureVideoFrame = (file: File, seekPoint: 'start' | 'end' = 'start'): Promise<string> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto'; // Safari needs 'auto' instead of 'metadata'
    video.muted = true;
    video.playsInline = true;
    video.autoplay = false;

    // Safari compatibility: set crossOrigin before src
    video.crossOrigin = 'anonymous';

    // Create object URL
    const fileUrl = URL.createObjectURL(file);

    // Timeout safety
    const timeout = setTimeout(() => {
      console.warn('[Safari] Video capture timeout');
      cleanup();
      resolve('');
    }, 8000); // Increased timeout for Safari

    const cleanup = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(fileUrl);
      video.remove();
    };

    let captureAttempted = false;

    const captureFrame = () => {
      if (captureAttempted) return;
      captureAttempted = true;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;

        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png', 0.95);
          console.log(`[Safari] Video frame captured successfully at ${seekPoint}`);
          cleanup();
          resolve(dataUrl);
        } else {
          console.error('[Safari] Invalid video dimensions or context');
          cleanup();
          resolve('');
        }
      } catch (e) {
        console.error('[Safari] Canvas capture failed', e);
        cleanup();
        resolve('');
      }
    };

    // Safari needs loadeddata event
    video.onloadeddata = () => {
      console.log('[Safari] Video data loaded, seeking...');
      if (seekPoint === 'end' && isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.max(0, video.duration - 0.2);
      } else {
        video.currentTime = 0.1;
      }
    };

    // Primary capture event
    video.onseeked = () => {
      console.log('[Safari] Video seeked, capturing frame...');
      // Small delay for Safari to render the frame
      setTimeout(captureFrame, 100);
    };

    // Fallback: if seeking doesn't work, try capturing on canplay
    video.oncanplay = () => {
      if (!captureAttempted) {
        console.log('[Safari] Fallback: capturing on canplay');
        setTimeout(captureFrame, 200);
      }
    };

    video.onerror = (e) => {
      console.error('[Safari] Video loading error', e);
      cleanup();
      resolve('');
    };

    // Set src after all event listeners are attached
    video.src = fileUrl;

    // Safari may need explicit load call
    video.load();
  });
};

const App: React.FC = () => {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState<AdTemplate[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  // NOTE: 后台密码验证弹窗状态
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminPasswordError, setAdminPasswordError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await getTemplates();
      setTemplates(prev => {
        return data.map(tpl => {
          const old = prev.find(p => p.id === tpl.id);
          return {
            ...tpl,
            checked: old ? old.checked : false,
            smartExtract: old ? old.smartExtract : true,
            iconColor: old ? old.iconColor : '#FF00FF',
            gradientColor: old ? old.gradientColor : '#FF6B6B',
            palette: old ? old.palette : []
          };
        });
      });
      setConfig(prev => ({ ...prev, assetsVersion: Date.now() }));
    } catch (error) {
      console.error("Failed to load templates", error);
    }
  };
  const [config, setConfig] = useState<AdConfig>({
    showMask: false,
    showCrop: false,
    splashText: '跳转至第三方平台',
    captureFirstFrame: false,
    captureLastFrameMtF1: false,
    assetsVersion: Date.now(),
  });
  const [rawFiles, setRawFiles] = useState<RawFile[]>([]);
  const [processedAssets, setProcessedAssets] = useState<AdAsset[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      if (scrollY > 200) {
        setIsCollapsed(true);
      } else if (scrollY < 50) {
        setIsCollapsed(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleTemplateToggle = (id: string) => {
    setTemplates(prev => prev.map(tpl => tpl.id === id ? { ...tpl, checked: !tpl.checked } : tpl));
  };

  const handleTemplateUpdate = (id: string, updates: Partial<AdTemplate>) => {
    // 1. Update the template state
    setTemplates(prev => prev.map(tpl => {
      if (tpl.id !== id) return tpl;

      // Logic: If smartExtract is being turned ON, try to restore palette colors if available
      if (updates.smartExtract === true && tpl.palette && tpl.palette.length > 0) {
        const paletteScheme = tpl.palette[0];
        // We mutate updates here to ensure the state update includes the colors
        updates.iconColor = paletteScheme.iconColor;
        updates.gradientColor = paletteScheme.gradientColor;
      }

      return { ...tpl, ...updates };
    }));

    // 2. Propagate changes to existing processed assets
    // We check either the incoming updates OR if we just auto-restored colors due to smartExtract
    setProcessedAssets(prev => prev.map(asset => {
      if (asset.id.endsWith(id)) {
        // If we are updating colors explicitly
        if (updates.iconColor || updates.gradientColor) {
          return {
            ...asset,
            aiExtractedColor: updates.iconColor || asset.aiExtractedColor,
            gradientColor: updates.gradientColor || asset.gradientColor
          };
        }
        // If we turned on smartExtract, we might need to look up the template's *new* state (complex in functional update),
        // or just rely on the fact that if we updated colors above in `updates`, we hit the block above.
        // However, if we just toggled smartExtract and didn't pass colors in `updates` (but derived them inside setTemplates),
        // we might miss the propagation here unless we read the *result* of the template update.
        // To simplify, we rely on the user or the caller to pass specific color updates if they want them applied now.
        // But for the "Dice" button, it passes specific colors, so that works.
        // For the "Toggle" button, it passes { smartExtract: true }.

        // Let's refine: If smartExtract became true, we want to revert assets to their original aiExtracted flavors or the template's current palette.
        // Since `setTemplates` is async/batched, we can't read the new template state here easily.
        // We will do a robust check: look at the *previous* template state + updates.
      }
      return asset;
    }));

    // Correction: The above logic for smartExtract toggle propagation is tricky because we need the palette which is in `prev` templates.
    // Let's do a second pass to handle the "On Smart Extract Enable" sync specifically.
    if (updates.smartExtract === true) {
      // We need to find the template to get its palette
      const targetTpl = templates.find(t => t.id === id);
      if (targetTpl && targetTpl.palette && targetTpl.palette.length > 0) {
        const scheme = targetTpl.palette[0];
        setProcessedAssets(prev => prev.map(asset => {
          if (asset.id.endsWith(id)) {
            return {
              ...asset,
              aiExtractedColor: scheme.iconColor,
              gradientColor: scheme.gradientColor
            };
          }
          return asset;
        }));
      }
    }
  };

  const handleConfigChange = (newConfig: Partial<AdConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  // NOTE: 允许的视频尺寸白名单，图片不受此限制
  const ALLOWED_VIDEO_DIMENSIONS = [
    { width: 1126, height: 900 },
    { width: 1440, height: 2340 },
    { width: 1440, height: 1938 },
  ];

  /**
   * 校验视频尺寸是否符合要求
   * @returns true 表示尺寸合法，false 表示尺寸不符合
   */
  const validateVideoDimensions = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      const url = URL.createObjectURL(file);
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        const w = video.videoWidth;
        const h = video.videoHeight;
        const isValid = ALLOWED_VIDEO_DIMENSIONS.some(d => d.width === w && d.height === h);
        resolve(isValid);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        // 无法读取尺寸时放行，避免误拦截
        resolve(true);
      };
      video.src = url;
    });
  };

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const newFilesArray = Array.from(files);

    newFilesArray.forEach(async (f) => {
      const file = f as File;

      // NOTE: 仅对视频格式校验尺寸，图片不受限制
      if (file.type.startsWith('video/')) {
        const isValidSize = await validateVideoDimensions(file);
        if (!isValidSize) {
          const allowedList = ALLOWED_VIDEO_DIMENSIONS.map(d => `${d.width}x${d.height}px`).join('、');
          alert(`视频尺寸不符合要求！\n\n请上传以下尺寸之一的视频：\n${allowedList}\n\n当前文件：${file.name}`);
          return;
        }
      }

      const id = Math.random().toString(36).substr(2, 9);
      const previewUrl = URL.createObjectURL(file as any);

      // Add file immediately for responsiveness
      setRawFiles(prev => [...prev, {
        id,
        file,
        previewUrl
      }]);

      // Then process thumbnail in background
      if (file.type.startsWith('video/')) {
        try {
          const thumb = await captureVideoFrame(file);
          if (thumb) {
            setRawFiles(prev => prev.map(f => f.id === id ? { ...f, thumbnailUrl: thumb } : f));
          }
        } catch (e) {
          console.error("Video thumbnail extraction failed", e);
        }
      }
    });
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we are actually leaving the drop zone
    const rect = e.currentTarget.getBoundingClientRect();
    if (
      e.clientX <= rect.left ||
      e.clientX >= rect.right ||
      e.clientY <= rect.top ||
      e.clientY >= rect.bottom
    ) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFiles(files);
    }
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
    const activeTemplates = templates.filter(tpl => tpl.checked);
    if (rawFiles.length === 0 || activeTemplates.length === 0) return;

    setIsProcessing(true);
    setProcessedAssets([]);
    setGenerationProgress({ current: 0, total: rawFiles.length * activeTemplates.length });

    // NOTE: 先插入所有占位 loading 卡，让用户即时看到即将生成的卡片数量
    const placeholders: AdAsset[] = [];
    for (const raw of rawFiles) {
      for (const template of activeTemplates) {
        placeholders.push({
          id: `${raw.id}-${template.id}`,
          url: '',
          name: raw.file.name,
          size: '',
          isCompressed: false,
          type: raw.file.type,
          category: template.category,
          app: template.app,
          templateName: template.name,
          dimensions: template.dimensions || '1080 x 1920',
          isLoading: true,
        });
      }
    }
    setProcessedAssets(placeholders);

    const results: AdAsset[] = [];

    for (const raw of rawFiles) {
      for (const template of activeTemplates) {
        const isVideo = raw.file.type.startsWith('video/');

        // Handle Smart Extract with Palette support per template
        let analysis: { hexColor: string; gradientColor: string; colors: ColorScheme[] } = {
          hexColor: template.iconColor || '#FF00FF',
          gradientColor: template.gradientColor || '#FF6B6B',
          colors: template.palette || []
        };

        if (template.smartExtract) {
          let extractSource = raw.previewUrl;
          if (isVideo) {
            let thumb = raw.thumbnailUrl;
            // For mt-f-2, force capture from end if it's a video
            const seekPoint = 'start'; // Temporarily using 'start' for mt-f-2 debugging
            if (!thumb || template.id === 'mt-f-2') {
              // Note: If thumb exists (from file upload preview), it might be start frame. 
              // For mt-f-2 we need end frame, so re-capture if needed or just capture specific frame.
              // Ideally we should cache this but for now re-capture to be safe or checking if we already have the right thumb is hard.
              // Let's just capture.
              thumb = await captureVideoFrame(raw.file, seekPoint);
            }
            if (thumb) extractSource = thumb;
          }

          const isSpecialFocal = template.id === 'mt-f-1' || template.id === 'mt-f-2';
          const fullPalette = await extractSmartPalette(extractSource, {
            bottomRegionHeight: isSpecialFocal ? 0.05 : 0.2,
            strictDominance: isSpecialFocal
          });
          const palette = (isSpecialFocal) ? fullPalette.slice(0, 3) : fullPalette;

          analysis = {
            hexColor: palette[0]?.iconColor || analysis.hexColor,
            gradientColor: palette[0]?.gradientColor || analysis.gradientColor,
            colors: palette
          };

          // Update template's state so the UI (and future generations) reflects the extracted colors
          // Important: We do this ONLY for the first file to set as default, or we can just use the analysis locally
          handleTemplateUpdate(template.id, {
            palette: palette,
            iconColor: analysis.hexColor,
            gradientColor: analysis.gradientColor
          });
        }

        let finalUrl = raw.previewUrl;

        // category check
        const isSplash = template.category === '开屏';
        // Precise classification for Focal Windows
        const isStaticFocal = template.category === '焦点视窗' && template.name.includes('静态') && !template.name.includes('沉浸式');
        const isDynamicFocal = template.category === '焦点视窗' && template.name.includes('动态') && !template.name.includes('沉浸式');
        const isImmersive = template.category === '焦点视窗' && template.name.includes('沉浸式'); // Assuming Immersive is mostly static images or specific logic
        const isNonFullscreenSplash = template.id === 'mt-s-5';

        const isHotRecommend = template.id === 'mt-ib-1';
        const isHotSearch = template.id === 'mt-ib-2';
        const isTopicBg = template.id === 'mt-ib-3';
        const isTopicBanner = template.id === 'mt-ib-4';
        const isScorePopup = template.id === 'mt-p-1';
        const isHomePopup = template.id === 'mt-p-2' || template.id === 'mt-p-3';
        // NOTE: 一键配方图文，信息流模板，裁剪至 720x960
        const isRecipeContent = template.id === 'mt-fe-1';
        const isMts1 = template.id === 'mt-s-1';

        // 1. If Workflow exists -> Try ComfyUI -> Fallback to Smart Crop (if image) or Thumbnail (if video)
        // Special handling: If captureFirstFrame is enabled for dynamic splash, skip workflow entirely
        const isDynamicTemplate = template.name.includes('动态');
        const shouldCaptureFrame = isSplash && isDynamicTemplate && isVideo && config.captureFirstFrame;

        if (shouldCaptureFrame) {
          // Skip workflow, directly capture and process first frame
          console.log(`[Splash Debug] captureFirstFrame enabled for ${template.id}, skipping workflow...`);
          try {
            let thumb = raw.thumbnailUrl;
            if (!thumb) thumb = await captureVideoFrame(raw.file);
            if (thumb) {
              const resp = await fetch(thumb);
              const blob = await resp.blob();
              const forceJpeg = isSplash || template.category === '焦点视窗';
              const file = new File([blob], forceJpeg ? "captured_frame.jpg" : "captured_frame.png", { type: forceJpeg ? "image/jpeg" : "image/png" });
              const compressed = await smartCropImage(file, 1440, isNonFullscreenSplash ? 1938 : 2340, 200);
              if (compressed?.url) {
                finalUrl = `${ASSETS_URL}${compressed.url}`;
                console.log(`[Splash Debug] First frame captured and processed: ${finalUrl}`);
              } else {
                finalUrl = thumb;
              }
            } else {
              finalUrl = raw.previewUrl;
            }
          } catch (e) {
            console.error('[Splash Debug] Frame capture failed:', e);
            finalUrl = raw.previewUrl;
          }
        }
        else if (template.workflow_id) {
          try {
            console.log(`[App] Template ${template.name} has workflow. Executing...`);
            const { path: serverPath } = await uploadRawAsset(raw.file);
            const comfyResult = await generateComfyUI(template.workflow_id, {
              inputPath: serverPath,
              ...config
            });

            if (comfyResult.ok && comfyResult.resultUrl) {
              const resultUrl = comfyResult.resultUrl as string;
              finalUrl = resultUrl.startsWith('http') ? resultUrl : `${ASSETS_URL}${resultUrl}`;

              // Post-processing: Compress if image
              if (finalUrl.match(/\.(png|jpg|jpeg|webp)$/i) || finalUrl.includes('/view?')) {
                try {
                  console.log(`[App] Compressing generated result: ${finalUrl}`);
                  const resp = await fetch(finalUrl);
                  const blob = await resp.blob();
                  const forceJpeg = isSplash || template.category === '焦点视窗';
                  const file = new File([blob], forceJpeg ? "generated_output.jpg" : "generated_output.png", { type: forceJpeg ? "image/jpeg" : blob.type });

                  // Determine target size
                  const targetW = isImmersive ? 1440 : (isStaticFocal ? 1126 : (isHotRecommend ? 720 : 1440));
                  const targetH = isNonFullscreenSplash ? 1938 : (isImmersive ? 2340 : (isStaticFocal ? 900 : (isHotRecommend ? 960 : 2340)));

                  const limitKB = (isSplash || template.category === '焦点视窗') ? 200 : 250;
                  const compressed = await smartCropImage(file, targetW, targetH, limitKB);
                  if (compressed?.url) {
                    finalUrl = `${ASSETS_URL}${compressed.url}`;
                    console.log(`[App] Compression success: ${compressed.sizeKB}KB`);
                  }
                } catch (e) {
                  console.error("Post-generation compression failed, using original", e);
                }
              }
            } else {
              throw new Error("ComfyUI returned no result");
            }
          } catch (err) {
            console.error("Workflow failed, attempting fallback...", err);

            // Fallback Logic
            if (raw.file.type.startsWith('image/')) {
              try {
                // Determine smart crop dimensions based on type
                const w = isImmersive ? 1440 : (isStaticFocal ? 1126 : ((isHotRecommend || isHomePopup) ? 720 : 1440));
                const h = isNonFullscreenSplash ? 1938 : (isImmersive ? 2340 : (isStaticFocal ? 900 : ((isHotRecommend || isHomePopup) ? 960 : 2340)));

                const limitKB = (isSplash || template.category === '焦点视窗') ? 200 : 250;
                const smart = await smartCropImage(raw.file, w, h, limitKB);
                if (smart?.url) {
                  finalUrl = `${ASSETS_URL}${smart.url}`;
                  console.log(`Fallback to Smart Crop (${w}x${h}) success`);
                }
              } catch (e) { console.error("Smart Crop fallback failed", e); }
            } else if (raw.file.type.startsWith('video/')) {
              // Splash Dynamic fallback logic
              const isDynamicTemplate = template.name.includes('动态');
              if (isSplash && isDynamicTemplate && config.captureFirstFrame) {
                // Actually isDynamicFocal is for Focal Window. Splash might need its own check.
                // Let's use template.name.includes('动态') directly or rely on isDynamicFocal if it was meant to be generic?
                // No, isDynamicFocal was specific to '焦点视窗'.
                // Let's use `template.name.includes('动态')` locally.
                console.log(`[Splash Debug] Capturing first frame for ${template.id}`);
                let thumb = raw.thumbnailUrl;
                if (!thumb) thumb = await captureVideoFrame(raw.file);
                if (thumb) {
                  try {
                    const resp = await fetch(thumb);
                    const blob = await resp.blob();
                    const forceJpeg = isSplash || template.category === '焦点视窗';
                    const file = new File([blob], forceJpeg ? "fallback_frame.jpg" : "fallback_frame.png", { type: forceJpeg ? "image/jpeg" : "image/png" });
                    const compressed = await smartCropImage(file, 1440, isNonFullscreenSplash ? 1938 : 2340, 200);
                    if (compressed?.url) {
                      finalUrl = `${ASSETS_URL}${compressed.url}`;
                      console.log(`[Splash Debug] First frame captured: ${finalUrl}`);
                    } else {
                      finalUrl = thumb;
                    }
                  } catch (e) {
                    console.error('[Splash Debug] Frame processing failed:', e);
                    finalUrl = thumb;
                  }
                } else {
                  finalUrl = raw.previewUrl;
                }
              } else {
                finalUrl = raw.previewUrl;
              }
            }
          }
        }
        // 2. No Workflow BUT is Splash Screen + Image -> Force Smart Crop
        else if (isSplash && raw.file.type.startsWith('image/')) {
          try {
            const h = isNonFullscreenSplash ? 1938 : 2340;
            const smart = await smartCropImage(raw.file, 1440, h, 200);
            if (smart?.url) finalUrl = `${ASSETS_URL}${smart.url}`;
          } catch (e) {
            console.error("Direct Smart Crop failed", e);
          }
        }
        // 3. Dynamic Splash Video (No Workflow)
        // 3. Dynamic Splash Video (No Workflow)
        else if (isSplash && template.name.includes('动态') && raw.file.type.startsWith('video/')) {
          if (config.captureFirstFrame) {
            let thumb = raw.thumbnailUrl;
            if (!thumb) thumb = await captureVideoFrame(raw.file);
            if (thumb) {
              try {
                const resp = await fetch(thumb);
                const blob = await resp.blob();
                const forceJpeg = isSplash || template.category === '焦点视窗';
                const file = new File([blob], forceJpeg ? "first_frame.jpg" : "first_frame.png", { type: forceJpeg ? "image/jpeg" : "image/png" });
                const compressed = await smartCropImage(file, 1440, isNonFullscreenSplash ? 1938 : 2340, 200);
                if (compressed?.url) finalUrl = `${ASSETS_URL}${compressed.url}`;
                else finalUrl = thumb;
              } catch (e) { finalUrl = thumb; }
            } else {
              finalUrl = raw.previewUrl;
            }
          } else {
            finalUrl = raw.previewUrl;
          }
        }
        // 4. Static Focal Window + Image -> Force Smart Crop (1126x900)
        else if ((isStaticFocal || isImmersive) && raw.file.type.startsWith('image/')) {
          try {
            const w = isImmersive ? 1440 : 1126;
            const h = isImmersive ? 2340 : 900;
            const smart = await smartCropImage(raw.file, w, h, 250);
            if (smart?.url) finalUrl = `${ASSETS_URL}${smart.url}`;
          } catch (e) {
            console.error("Smart extract/crop failed", e);
          }
        }
        // NEW: Static Focal Window + Video -> Capture 1st Frame as Image
        else if ((isStaticFocal || isImmersive) && raw.file.type.startsWith('video/')) {
          try {
            console.log(`[mt-f-2 Debug] Processing video for ${template.id}, file: ${raw.file.name}`);
            const seekPoint = 'start'; // Using 'start' for all static focal windows
            const thumb = await captureVideoFrame(raw.file, seekPoint);
            console.log(`[mt-f-2 Debug] Captured thumb:`, thumb ? `${thumb.substring(0, 50)}...` : 'null');
            if (thumb) {
              const resp = await fetch(thumb);
              const blob = await resp.blob();
              const forceJpeg = isSplash || template.category === '焦点视窗';
              const file = new File([blob], forceJpeg ? "first_frame_focal.jpg" : "first_frame_focal.png", { type: forceJpeg ? "image/jpeg" : "image/png" });

              const w = isImmersive ? 1440 : 1126;
              const h = isImmersive ? 2340 : 900;
              const smart = await smartCropImage(file, w, h, 250);
              console.log(`[mt-f-2 Debug] Smart crop result:`, smart);
              if (smart?.url) finalUrl = `${ASSETS_URL}${smart.url}`;
              else finalUrl = thumb;
              console.log(`[mt-f-2 Debug] Final URL:`, finalUrl);
            }
          } catch (e) {
            console.error("[mt-f-2 Debug] Focal Window Video Frame capture failed", e);
            finalUrl = raw.previewUrl; // Fallback
          }
        }
        // 5. Hot Recommend (热推第三位) + Image -> Force Smart Crop (720x960)
        else if (isHotRecommend && raw.file.type.startsWith('image/')) {
          try {
            const smart = await smartCropImage(raw.file, 720, 960, 250);
            if (smart?.url) finalUrl = `${ASSETS_URL}${smart.url}`;
          } catch (e) {
            console.error("Direct Smart Crop (Hot Recommend) failed", e);
          }
        }
        // 6. Topic Background (话题页背景板) + Image -> Force Smart Crop (1126x640)
        else if (isTopicBg && raw.file.type.startsWith('image/')) {
          try {
            const smart = await smartCropImage(raw.file, 1126, 640, 250);
            if (smart?.url) finalUrl = `${ASSETS_URL}${smart.url}`;
          } catch (e) {
            console.error("Direct Smart Crop (Topic Bg) failed", e);
          }
        }
        // 7. Topic Banner (话题页banner) + Image -> Force Smart Crop (1029x288)
        else if (isTopicBanner && raw.file.type.startsWith('image/')) {
          try {
            const smart = await smartCropImage(raw.file, 1029, 288, 250);
            if (smart?.url) finalUrl = `${ASSETS_URL}${smart.url}`;
          } catch (e) {
            console.error("Direct Smart Crop (Topic Banner) failed", e);
          }
        }
        // 8. Hot Search (热搜词第四位) + Image -> Force Smart Crop (156x156)
        else if (isHotSearch && raw.file.type.startsWith('image/')) {
          try {
            const smart = await smartCropImage(raw.file, 156, 156, 250);
            if (smart?.url) finalUrl = `${ASSETS_URL}${smart.url}`;
          } catch (e) {
            console.error("Direct Smart Crop (Hot Search) failed", e);
          }
        }
        // 9. Score Popup (保分页弹窗) + Image -> Force Smart Crop (960x1440)
        else if (isScorePopup && raw.file.type.startsWith('image/')) {
          try {
            const smart = await smartCropImage(raw.file, 960, 1440, 250);
            if (smart?.url) finalUrl = `${ASSETS_URL}${smart.url}`;
          } catch (e) {
            console.error("Direct Smart Crop (Score Popup) failed", e);
          }
        }
        // 9.5 Home Popup (首页弹窗) + Image -> Force Smart Crop (720x960)
        else if (isHomePopup && raw.file.type.startsWith('image/')) {
          try {
            const smart = await smartCropImage(raw.file, 720, 960, 250);
            if (smart?.url) finalUrl = `${ASSETS_URL}${smart.url}`;
          } catch (e) {
            console.error("Direct Smart Crop (Home Popup) failed", e);
          }
        }
        // 10. 一键配方图文 (信息流) + Image -> Force Smart Crop (720x960)
        else if (isRecipeContent && raw.file.type.startsWith('image/')) {
          try {
            const smart = await smartCropImage(raw.file, 720, 960, 250);
            if (smart?.url) finalUrl = `${ASSETS_URL}${smart.url}`;
          } catch (e) {
            console.error("Direct Smart Crop (Recipe Content) failed", e);
          }
        }
        // 11. Video Handling (Dynamic Focal etc.)
        else if (raw.file.type.startsWith('video/')) {
          // NOTE: mt-f-1 动态焦点视窗 + 开启「截取最后一帧」→ 截取视频最后一帧并合成为静态图
          if (template.id === 'mt-f-1' && config.captureLastFrameMtF1) {
            try {
              console.log(`[mt-f-1] captureLastFrameMtF1 enabled, seeking to end...`);
              const lastFrame = await captureVideoFrame(raw.file, 'end');
              if (lastFrame) {
                const resp = await fetch(lastFrame);
                const blob = await resp.blob();
                const forceJpeg = isSplash || template.category === '焦点视窗';
                const frameFile = new File([blob], forceJpeg ? 'last_frame_mtf1.jpg' : 'last_frame_mtf1.png', { type: forceJpeg ? 'image/jpeg' : 'image/png' });
                const smart = await smartCropImage(frameFile, 1126, 900, 250);
                if (smart?.url) {
                  finalUrl = `${ASSETS_URL}${smart.url}`;
                  console.log(`[mt-f-1] Last frame captured and cropped to 1126x900: ${finalUrl}`);
                } else {
                  finalUrl = lastFrame;
                }
              }
            } catch (e) {
              console.error('[mt-f-1] Last frame capture failed, falling back to video', e);
              finalUrl = raw.previewUrl;
            }
          } else {
            // Dynamic Focal stays as video (default)
            finalUrl = raw.previewUrl;
          }
        }

        const newAsset: AdAsset = {
          id: `${raw.id}-${template.id}`,
          url: finalUrl,
          name: raw.file.name,
          size: `${Math.round(raw.file.size / 1024)}k`,
          isCompressed: true,
          type: (() => {
            if (!raw.file.type.startsWith('video/')) return raw.file.type;
            if (isStaticFocal || isImmersive) return 'image/png';
            // NOTE: mt-f-1 截取最后一帧时，输出为静态图
            if (template.id === 'mt-f-1' && config.captureLastFrameMtF1) return 'image/png';
            if (isSplash && template.name.includes('动态') && config.captureFirstFrame) {
              return template.id === 'mt-s-1' ? 'image/jpeg' : 'image/png';
            }
            if (finalUrl.match(/\.(jpg|jpeg)$/i)) return 'image/jpeg';
            if (finalUrl.startsWith('data:image/jpeg')) return 'image/jpeg';
            if (finalUrl.startsWith('data:') || finalUrl.match(/\.(png|webp)$/i)) return 'image/png';
            return 'video/mp4';
          })(),
          category: template.category,
          app: template.app,
          templateName: template.name,
          aiExtractedColor: analysis.hexColor,
          gradientColor: analysis.gradientColor,
          aiExtractedColors: analysis.colors,
          dimensions:
            (isSplash && raw.file.type.startsWith('image/')) ? (isNonFullscreenSplash ? '1440 x 1938' : '1440 x 2340') :
              (isImmersive && (raw.file.type.startsWith('image/') || true)) ? '1440 x 2340' :
                (isStaticFocal && (raw.file.type.startsWith('image/') || true)) ? '1126 x 900' :
                  // NOTE: mt-f-1 截取最后一帧时使用 1126×900 尺寸
                  (template.id === 'mt-f-1' && config.captureLastFrameMtF1 && raw.file.type.startsWith('video/')) ? '1126 x 900' :
                    ((isHotRecommend || isHomePopup) && raw.file.type.startsWith('image/')) ? '720 x 960' :
                      (isScorePopup && raw.file.type.startsWith('image/')) ? '960 x 1440' :
                        (isTopicBg && raw.file.type.startsWith('image/')) ? '1126 x 640' :
                          (isRecipeContent && raw.file.type.startsWith('image/')) ? '720 x 960' :
                            (template.dimensions || '1080 x 1920'),
          splashText: (template.category === '开屏' || template.id === 'mt-p-1') ? config.splashText : undefined,
          maskUrl: template.mask_path ? `${template.mask_path}?v=${config.assetsVersion}` : null,
          cropOverlayUrl: template.crop_overlay_path ? `${template.crop_overlay_path}?v=${config.assetsVersion}` : null,
          badgeOverlayUrl: template.badge_overlay_path ? `${template.badge_overlay_path}?v=${config.assetsVersion}` : null,
        };

        results.push(newAsset);
        // NOTE: 替换对应 id 的占位 loading 卡为真实结果，保持顺序不变
        setProcessedAssets(prev => prev.map(a => a.id === newAsset.id ? newAsset : a));
        setGenerationProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);

        if (template.id === 'mt-f-2' || template.id === 'mt-s-1') {
          console.log(`[Debug ${template.id}] Pushed result:`, {
            id: `${raw.id}-${template.id}`,
            url: finalUrl,
            originalFileType: raw.file.type,
            finalType: (() => {
              if (!raw.file.type.startsWith('video/')) return raw.file.type;
              if (isStaticFocal || isImmersive) return 'image/png';
              if (isSplash && template.name.includes('动态') && config.captureFirstFrame) return 'image/png';
              if (finalUrl.startsWith('data:') || finalUrl.match(/\.(png|jpg|jpeg|webp)$/i)) return 'image/png';
              return 'video/mp4';
            })(),
            captureFirstFrame: config.captureFirstFrame,
            isStaticFocal,
            isImmersive,
            isSplash
          });
        }
      }
    }

    const hasFocalWindow = activeTemplates.some(tpl => tpl.category === '焦点视窗');
    if (hasFocalWindow) {
      setTimeout(() => setConfig(prev => ({ ...prev, showMask: true })), 0);
    }

    // Increment usage metrics for all active templates
    Promise.all(activeTemplates.map(async (tpl) => {
      try {
        // Increment once for each raw file processed by this template
        let latestCount = tpl.processedCount || 0;
        for (let i = 0; i < rawFiles.length; i++) {
          const res = await incrementTemplateUsage(tpl.id);
          latestCount = res.processedCount;
        }
        setTemplates(prev => prev.map(t => t.id === tpl.id ? { ...t, processedCount: latestCount } : t));
      } catch (e) {
        console.error(`Failed to increment usage for template ${tpl.id}`, e);
      }
    }));

    console.log(`[App] Generation complete. Results:`, results.map(r => ({ name: r.name, color: r.aiExtractedColor })));

    setProcessedAssets(results);
    setIsProcessing(false);
    setGenerationProgress(null);
  };

  const handleUpdateAsset = (assetId: string, updates: Partial<AdAsset>) => {
    setProcessedAssets(prev => prev.map(a => a.id === assetId ? { ...a, ...updates } : a));
  };

  const clearAll = () => {
    rawFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
    setRawFiles([]);
    setProcessedAssets([]);
  };

  const handleBatchDownload = async () => {
    if (processedAssets.length === 0) return;

    const hasVideo = processedAssets.some(asset => asset.type.startsWith('video'));
    if (hasVideo) {
      alert('此网站仅支持视频卡片预览及图片格式保存。');
      if (processedAssets.every(asset => asset.type.startsWith('video'))) {
        return;
      }
    }

    try {
      const zip = new JSZip();
      const folderName = `ad-assets-${new Date().toISOString().slice(0, 10)}`;
      const folder = zip.folder(folderName);

      // Create a map to handle duplicate filenames
      const nameCounts: Record<string, number> = {};

      for (const asset of processedAssets) {
        if (asset.type.startsWith('video')) continue;

        try {
          // Pass the individual asset's showBadge state if available
          const blob = await compositeAsset(asset, {
            ...config,
            showBadge: asset.showBadge
          } as any);

          // Determine actual extension based on blob type or asset info
          let ext = 'jpg';
          if (asset.type.startsWith('video') || blob.type.startsWith('video/')) {
            ext = 'mp4';
          } else if (blob.type === 'image/png') {
            ext = 'png';
          } else if (blob.type === 'image/webp') {
            ext = 'webp';
          } else {
            // Fallback to original extension if blob type is generic or unknown
            const parts = asset.name.split('.');
            if (parts.length > 1) {
              const originalExt = parts.pop()?.toLowerCase();
              ext = originalExt === 'mp4' || originalExt === 'mov' || originalExt === 'quicktime' ? 'mp4' : (originalExt || 'jpg');
            }
          }

          // Construct a meaningful filename
          // Format: {App}-{Template}-{Dimensions}-{OriginalName}
          const safeName = asset.name.replace(/\.[^/.]+$/, ""); // remove extension

          let filename = `${asset.app}-${asset.templateName}-${asset.dimensions.replace(/\s/g, '')}-${safeName}.${ext}`
            .replace(/[\/\\?%*:|"<>]/g, '-'); // Sanitize chars

          // Handle duplicates
          if (nameCounts[filename]) {
            nameCounts[filename]++;
            const nameParts = filename.split('.');
            const currentExt = nameParts.pop();
            filename = `${nameParts.join('.')}_(${nameCounts[filename]}).${currentExt}`;
          } else {
            nameCounts[filename] = 1;
          }

          folder?.file(filename, blob);
        } catch (e) {
          console.error("Failed to composite asset for zip:", asset.name, e);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${folderName}.zip`);
    } catch (error) {
      console.error("Batch download failed", error);
      alert(t('common.failZip'));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg transition-colors duration-300">
      <Header onOpenAdmin={() => {
        setAdminPasswordInput('');
        setAdminPasswordError(false);
        setShowAdminPasswordModal(true);
      }} />

      {/* NOTE: 后台密码验证弹窗 */}
      {showAdminPasswordModal && (
        <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowAdminPasswordModal(false); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-80 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[22px]">lock</span>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">管理后台</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">请输入访问密码</p>
              </div>
            </div>
            <input
              id="admin-password-input"
              type="password"
              autoFocus
              placeholder="请输入密码"
              className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all ${adminPasswordError
                ? 'border-red-400 bg-red-50 focus:ring-2 focus:ring-red-300'
                : 'border-slate-200 bg-slate-50 focus:ring-2 focus:ring-primary/30 focus:border-primary'
                }`}
              value={adminPasswordInput}
              onChange={(e) => { setAdminPasswordInput(e.target.value); setAdminPasswordError(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // NOTE: 密码为一个空格字符
                  if (adminPasswordInput === ' ') {
                    setShowAdminPasswordModal(false);
                    setShowAdmin(true);
                  } else {
                    setAdminPasswordError(true);
                  }
                }
              }}
            />
            {adminPasswordError && (
              <p className="text-xs text-red-500 font-semibold -mt-2">密码错误，请重试</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdminPasswordModal(false)}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-all"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (adminPasswordInput === ' ') {
                    setShowAdminPasswordModal(false);
                    setShowAdmin(true);
                  } else {
                    setAdminPasswordError(true);
                  }
                }}
                className="flex-1 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}


      <main className="flex-1 w-full flex">
        <Sidebar
          templates={templates}
          config={config}
          onTemplateToggle={handleTemplateToggle}
          onConfigChange={handleConfigChange}
          onTemplateUpdate={handleTemplateUpdate}
          activeCount={rawFiles.length}
          onGenerate={handleGenerate}
          isProcessing={isProcessing}
          generationProgress={generationProgress}
        />

        <div className="flex-1 flex flex-col relative">
          {/* Raw Assets & Upload Section */}
          <section
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative px-6 pt-6 pb-4 shrink-0 transition-all duration-400 ease-in-out origin-top ${isCollapsed ? 'opacity-20 scale-[0.95] max-h-[120px] overflow-hidden' : 'opacity-100 max-h-[260px] overflow-y-auto custom-scrollbar'}`}
          >
            {/* Contextual Drag Overlay - Minimal */}
            {isDragging && !isCollapsed && (
              <div className="absolute inset-x-6 top-6 bottom-4 z-[60] pointer-events-none flex items-center justify-center animate-in fade-in duration-300">
                {/* Simple backdrop */}
                <div className="absolute inset-0 bg-primary/5 backdrop-blur-sm rounded-[32px]"></div>

                {/* Minimal text card */}
                <div className="relative bg-white px-8 py-4 rounded-xl shadow-lg border border-slate-200">
                  <p className="text-lg font-semibold text-slate-700">
                    {t('main.releaseToUpload')}
                  </p>
                </div>
              </div>
            )}
            {rawFiles.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group relative flex flex-col items-center justify-center border-2 border-dashed border-white/20 bg-white/10 hover:bg-white/20 rounded-[32px] p-12 transition-all cursor-pointer shadow-inner liquid-glass"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.mp4"
                  onChange={handleFileUpload}
                />
                <div className="mb-4 h-16 w-16 liquid-glass flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-4xl">cloud_upload</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 shadow-sm">{t('main.startCreation')}</h3>
                <p className="text-slate-500 text-xs mt-1 font-semibold text-center">{t('main.uploadHint')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('main.pendingAssets')} ({rawFiles.length})</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[11px] font-bold text-primary bg-white px-4 py-2 rounded-full shadow-ios hover:bg-slate-50 transition-all active:scale-95"
                    >
                      {t('main.addMore')}
                    </button>
                    <button
                      onClick={() => {
                        setRawFiles([]);
                        setProcessedAssets([]);
                      }}
                      className="text-[11px] font-bold text-red-500 bg-white px-4 py-2 rounded-full shadow-ios hover:bg-red-50 transition-all active:scale-95"
                    >
                      {t('main.clearAll')}
                    </button>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.mp4"
                    onChange={handleFileUpload}
                  />
                </div>
                <div className={`grid gap-5 pb-2 transition-all duration-400 ${isCollapsed ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 opacity-60' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5'}`}>
                  {rawFiles.map(raw => (
                    <div key={raw.id} className={`liquid-glass relative group p-1 transition-all lens-effect ${isCollapsed ? 'scale-90 hover:scale-100' : ''}`}>
                      <div className={`relative bg-slate-100 flex items-center justify-center overflow-hidden rounded-[16px] ${isCollapsed ? 'aspect-square' : 'aspect-[4/3]'}`}>
                        {raw.file.type.startsWith('video/') ? (
                          <div className="w-full h-full flex items-center justify-center bg-slate-900">
                            {raw.thumbnailUrl ? (
                              <img src={raw.thumbnailUrl} className="w-full h-full object-contain opacity-60" alt="thumb" />
                            ) : (
                              <span className="material-symbols-outlined text-white/50 text-3xl">play_circle</span>
                            )}
                            <span className="absolute material-symbols-outlined text-white text-3xl">play_circle</span>
                          </div>
                        ) : (
                          <img
                            src={raw.previewUrl}
                            className="w-full h-full object-contain"
                            alt="raw"
                          />
                        )}
                        <button
                          onClick={() => removeRawFile(raw.id)}
                          className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      </div>
                      {!isCollapsed && (
                        <div className="p-3">
                          <p className="text-[10px] text-slate-700 truncate font-bold">{raw.file.name}</p>
                          <p className="text-[9px] text-slate-400 font-black mt-0.5">{Math.round(raw.file.size / 1024)} KB</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Sticky Controller Header */}
          <div className="px-6 pt-6 pb-3 sticky top-[76px] z-30 pointer-events-none transition-all duration-300">
            <div className="flex items-center justify-between px-6 py-4 liquid-glass border border-white/30 shadow-sm pointer-events-auto">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 liquid-glass flex items-center justify-center text-primary shadow-inner">
                    <span className="material-symbols-outlined text-[24px]">grid_view</span>
                  </div>
                  <h2 className="text-base font-bold text-slate-800">生成预览</h2>
                </div>
                {processedAssets.length > 0 && !isProcessing && (
                  <span className="text-xs font-bold text-primary bg-primary/20 backdrop-blur-md border border-primary/30 px-3 py-1 rounded-full">
                    {processedAssets.length} 份匹配资产
                  </span>
                )}
                {isProcessing && generationProgress && (
                  <span className="text-xs font-bold text-blue-500 bg-blue-500/10 backdrop-blur-md border border-blue-500/20 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                    <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                    生成中 {generationProgress.current} / {generationProgress.total}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 px-4 py-2 bg-white/50 rounded-xl border border-black/5">
                  <span className="text-[11px] font-bold text-slate-500">全显遮罩</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={config.showMask}
                      onChange={() => handleConfigChange({ showMask: !config.showMask })}
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary transition-all"></div>
                  </label>
                </div>

                <div className="flex items-center gap-3 px-4 py-2 bg-white/50 rounded-xl border border-black/5">
                  <span className="text-[11px] font-bold text-slate-500">全显裁剪</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={config.showCrop}
                      onChange={() => handleConfigChange({ showCrop: !config.showCrop })}
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary transition-all"></div>
                  </label>
                </div>

                {processedAssets.length > 0 && (
                  <button
                    onClick={() => setProcessedAssets([])}
                    className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/50 border border-black/5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="清空"
                  >
                    <span className="material-symbols-outlined text-[22px]">delete_sweep</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Processed Previews Section */}
          <div className="w-full pb-24 relative">
            <PreviewGrid
              assets={processedAssets}
              config={config}
              onClear={() => setProcessedAssets([])}
              onToggleMask={() => handleConfigChange({ showMask: !config.showMask })}
              onUpdateAsset={handleUpdateAsset}
              isGenerating={isProcessing}
            />
          </div>
        </div>
      </main >

      <Footer
        selectedCount={templates.filter(tpl => tpl.checked).length}
        assetCount={processedAssets.length}
        onDownload={handleBatchDownload}
      />


      {showAdmin && <AdminDashboard onClose={() => { setShowAdmin(false); loadTemplates(); }} />}
    </div >
  );
};

export default App;
