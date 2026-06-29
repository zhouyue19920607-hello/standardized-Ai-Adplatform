import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import DashboardWorkspace from './components/DashboardWorkspace';
import ConfigWorkspace from './components/ConfigWorkspace';
import { AdTemplate, AdAsset, AdConfig, ColorScheme, RawFile } from './types';
import { getTemplates, uploadRawAsset, generateComfyUI, ASSETS_URL, smartCropImage, adaptImageWithAigc, expandVideoWithAigc, incrementTemplateUsage, reportVisit } from './services/api';
import AdminDashboard from './components/AdminDashboard';
import { useLanguage } from './contexts/LanguageContext';
import { extractSmartColor, extractSmartPalette } from './utils/smartColor';
import { compositeAsset } from './utils/assetCompositor';
import fallbackTemplates from './backend/data/templates.json';

const HEADER_HEIGHT = 73;
const VISITOR_ID_KEY = 'standardized_adplatform_visitor_id';
// 标准素材看板临时切到外采 Gemini / Nano Banner 图像适配；视频 AI 扩展仍关闭，避免触发美图视频链路。
const STANDARD_BOARD_EXTERNAL_IMAGE_ADAPTATION_ENABLED = true;
const STANDARD_BOARD_AIGC_VIDEO_ADAPTATION_ENABLED = false;

const parseTemplateDimensions = (value?: string) => {
  const match = value?.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
};

const getTemplateOutputDimensions = (template: AdTemplate) => {
  const isSplash = template.category === '开屏';
  const isWink = template.app === 'wink';
  const isMeiyan = template.app === '美颜';
  const focalHeight = isWink ? 1410 : (isMeiyan ? 1128 : 900);
  const isStaticFocal = template.category === '焦点视窗' && template.name.includes('静态') && !template.name.includes('沉浸式');
  const isDynamicFocal = template.category === '焦点视窗' && (['mt-f-1', 'my-f-1', 'wk-f-1'].includes(template.id) || template.name.includes('动态')) && !template.name.includes('沉浸式');
  const isImmersive = template.category === '焦点视窗' && template.name.includes('沉浸式');
  const isNonFullscreenSplash = template.id === 'mt-s-5' || template.id === 'mt-s-6' || template.name.includes('非全屏');
  const isHotRecommend = template.id === 'mt-ib-1';
  const isHotSearch = template.id === 'mt-ib-2';
  const isTopicBg = template.id === 'mt-ib-3';
  const isTopicBanner = template.id === 'mt-ib-4';
  const isScorePopup = template.id === 'mt-p-1';
  const isHomePopup = template.id === 'mt-p-2' || template.id === 'mt-p-3';
  const isRecipeContent = template.id === 'mt-fe-1';

  if (isSplash) return { width: 1440, height: isNonFullscreenSplash ? 1938 : 2340 };
  if (isImmersive) return { width: 1440, height: 2340 };
  if (isStaticFocal || isDynamicFocal) return { width: isMeiyan ? 1284 : 1126, height: focalHeight };
  if (isHotRecommend || isHomePopup || isRecipeContent) return { width: 720, height: 960 };
  if (isScorePopup) return { width: 960, height: 1440 };
  if (isTopicBg) return { width: 1126, height: 640 };
  if (isTopicBanner) return { width: 1029, height: 288 };
  if (isHotSearch) return { width: 156, height: 156 };
  return parseTemplateDimensions(template.dimensions);
};

const getRequestErrorMessage = (error: unknown) => {
  const maybeAxios = error as {
    message?: string;
    response?: {
      status?: number;
      data?: unknown;
    };
  };
  const data = maybeAxios?.response?.data;
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const detail = record.details || record.error || record.message;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  if (typeof data === 'string' && data.trim()) return data;
  if (maybeAxios?.response?.status) {
    return `接口返回 ${maybeAxios.response.status}，但没有返回错误详情。请检查后端日志和谷仓环境变量。`;
  }
  if (error instanceof Error) return error.message;
  return '美图 AI 适配失败';
};

const describeAdaptImageResult = (result: {
  strategy?: string;
  plan?: { strategy?: string };
  qa?: { warnings?: string[]; passed?: boolean };
  analysis?: {
    subject?: { exists?: boolean } | null;
    logo?: { hasTarget?: boolean } | null;
    text?: { hasText?: boolean } | null;
  } | null;
  layeredRelayout?: {
    failed?: boolean;
    error?: string;
    status?: string;
    endpoint?: string;
    stage?: string;
    layers?: { mode?: string };
  } | null;
}) => {
  const mode = result.layeredRelayout?.layers?.mode || result.strategy || result.plan?.strategy || 'adapt';
  const planStrategy = result.plan?.strategy || result.strategy || 'adapt';
  const layeredFailed = Boolean(result.layeredRelayout?.failed);
  const layeredStatus = result.layeredRelayout?.status || (result.layeredRelayout ? 'executed' : 'not_started');
  const subjectDetected = Boolean(result.analysis?.subject?.exists);
  const logoDetected = Boolean(result.analysis?.logo?.hasTarget);
  const textDetected = Boolean(result.analysis?.text?.hasText);
  const qaPassed = result.qa?.passed;
  const relayoutExecuted = planStrategy === 'relayout' && Boolean(result.layeredRelayout) && !layeredFailed;
  const debugLines = [
    `plan.strategy: ${planStrategy}`,
    `layeredRelayout: ${result.layeredRelayout ? (layeredFailed ? `failed (${layeredStatus})` : `ok (${layeredStatus})`) : 'not_started'}`,
    `subject detected: ${subjectDetected ? 'yes' : 'no'}`,
    `logo detected: ${logoDetected ? 'yes' : 'no'}`,
    `text detected: ${textDetected ? 'yes' : 'no'}`,
    `qa passed: ${typeof qaPassed === 'boolean' ? (qaPassed ? 'yes' : 'no') : 'unknown'}`,
  ];
  if (result.layeredRelayout?.failed) {
    if (result.layeredRelayout.status === 'permission_denied') {
      return {
        label: `AI智能排版未执行：${result.layeredRelayout.endpoint || '分层接口'}权限未开`,
        strategy: 'permission_denied',
        warnings: result.qa?.warnings || [],
        debugLines,
        debugSummary: {
          planStrategy,
          layeredStatus,
          layeredFailed,
          relayoutExecuted,
          subjectDetected,
          logoDetected,
          textDetected,
          qaPassed,
        }
      };
    }
    return {
      label: `AI智能排版已降级：${result.layeredRelayout.error || mode}`,
      strategy: mode,
      warnings: result.qa?.warnings || [],
      debugLines,
      debugSummary: {
        planStrategy,
        layeredStatus,
        layeredFailed,
        relayoutExecuted,
        subjectDetected,
        logoDetected,
        textDetected,
        qaPassed,
      }
    };
  }
  const label = mode === 'multi-layer-v2'
    ? 'AI智能排版：多层重排 v2'
    : mode === 'foreground-background-v1'
      ? 'AI智能排版：前景/背景分层'
      : mode === 'relayout'
        ? 'AI智能排版：重排'
        : `AI适配：${mode}`;
  return {
    label,
    strategy: mode,
    warnings: result.qa?.warnings || [],
    debugLines,
    debugSummary: {
      planStrategy,
      layeredStatus,
      layeredFailed,
      relayoutExecuted,
      subjectDetected,
      logoDetected,
      textDetected,
      qaPassed,
    }
  };
};

const isRawImageMatchingTemplate = (raw: RawFile, template: AdTemplate) => {
  const target = getTemplateOutputDimensions(template);
  return Boolean(
    raw.file.type.startsWith('image/') &&
    raw.imageDimensions &&
    target &&
    raw.imageDimensions.width === target.width &&
    raw.imageDimensions.height === target.height
  );
};

const getVisitorId = () => {
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);
  if (!visitorId) {
    visitorId = `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }
  return visitorId;
};

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
        // NOTE: seek 到 0 确保截取真正的第 1 帧，而非 0.1s 处的帧
        video.currentTime = 0;
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

const getVideoMeta = (file: File): Promise<{ width: number; height: number; duration: number }> => (
  new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      });
      URL.revokeObjectURL(url);
      video.remove();
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      video.remove();
      reject(new Error('视频信息读取失败'));
    };
    video.src = url;
  })
);

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
      applyTemplates(data);
      setConfig(prev => ({ ...prev, assetsVersion: Date.now() }));
    } catch (error) {
      console.error("Failed to load templates", error);
      applyTemplates(fallbackTemplates as AdTemplate[]);
    }
  };
  const applyTemplates = (data: AdTemplate[]) => {
    setTemplates(prev => {
      return data.map(tpl => {
        const old = prev.find(p => p.id === tpl.id);
        return {
          ...tpl,
          checked: old ? old.checked : false,
          smartExtract: old ? old.smartExtract : (tpl.smartExtract ?? true),
          iconColor: old ? old.iconColor : (tpl.iconColor || '#FF00FF'),
          gradientColor: old ? old.gradientColor : (tpl.gradientColor || '#FF6B6B'),
          palette: old ? old.palette : (tpl.palette || [])
        };
      });
    });
  };
  const [config, setConfig] = useState<AdConfig>({
    showMask: true,
    showCrop: false,
    splashText: '跳转至第三方平台',
    captureFirstFrame: false,
    captureLastFrameSplash: false,
    captureFirstFrameMtP1: false,
    captureFirstFrameMtF1: false,
    captureLastFrameMtF1: false,
    captureFirstFrameMyF1: false,
    captureLastFrameMyF1: false,
    captureLastFrameWkF1: false,
    assetsVersion: Date.now(),
  });
  const [rawFiles, setRawFiles] = useState<RawFile[]>([]);
  const [processedAssets, setProcessedAssets] = useState<AdAsset[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visitReportedRef = useRef(false);

  useEffect(() => {
    if (visitReportedRef.current) return;
    visitReportedRef.current = true;
    reportVisit(getVisitorId(), window.location.pathname.startsWith('/config') ? 'creative' : 'standard', window.location.pathname).catch(error => {
      console.error('Failed to report visit', error);
    });
  }, []);

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

  const readVideoDimensions = (file: File): Promise<{ width: number; height: number; duration: number } | null> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      const url = URL.createObjectURL(file);
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
        });
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      video.src = url;
    });
  };

  const readImageDimensions = (file: File): Promise<{ width: number; height: number } | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  };

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const newFilesArray = Array.from(files);

    newFilesArray.forEach(async (f) => {
      const file = f as File;

      // NOTE: 视频不再限制上传尺寸；这里只读取尺寸，后续可交给 AI 视频扩展适配。
      let videoDimensions: { width: number; height: number; duration: number } | null = null;
      if (file.type.startsWith('video/')) {
        videoDimensions = await readVideoDimensions(file);
      }

      const id = Math.random().toString(36).substr(2, 9);
      const previewUrl = URL.createObjectURL(file as any);

      // Add file immediately for responsiveness
      setRawFiles(prev => [...prev, {
        id,
        file,
        previewUrl,
        ...(videoDimensions ? { videoDimensions } : {})
      }]);

      // Then process thumbnail in background
      if (file.type.startsWith('image/')) {
        const dimensions = await readImageDimensions(file);
        if (dimensions) {
          setRawFiles(prev => prev.map(f => f.id === id ? { ...f, imageDimensions: dimensions } : f));
        }
      } else if (file.type.startsWith('video/')) {
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

    const imageFiles = rawFiles.filter(raw => raw.file.type.startsWith('image/'));
    const pendingDimensionFiles = imageFiles.filter(raw => !raw.imageDimensions);
    if (pendingDimensionFiles.length > 0) {
      alert(`图片尺寸仍在检测中，请稍后再生成。\n\n${pendingDimensionFiles.map(raw => raw.file.name).join('\n')}`);
      return;
    }

    const mismatchReasons = imageFiles.flatMap(raw => {
      return activeTemplates
        .filter(template => !isRawImageMatchingTemplate(raw, template))
        .map(template => {
          const target = getTemplateOutputDimensions(template);
          const sourceSize = raw.imageDimensions ? `${raw.imageDimensions.width}x${raw.imageDimensions.height}` : '未知尺寸';
          const targetSize = target ? `${target.width}x${target.height}` : (template.dimensions || '未知模板尺寸');
          return `${raw.file.name}：${sourceSize} -> ${template.app}${template.name} ${targetSize}`;
        });
    });
    const requiresCrossTemplateAi = imageFiles.length === 1 && activeTemplates.length > 1;
    const requiresAiAdaptation = mismatchReasons.length > 0 || requiresCrossTemplateAi;
    if (requiresAiAdaptation) {
      const reasonText = [
        requiresCrossTemplateAi ? '同一张图片需要适配多个广告模板。' : '',
        ...mismatchReasons.slice(0, 6),
        mismatchReasons.length > 6 ? `还有 ${mismatchReasons.length - 6} 个适配项未展示。` : ''
      ].filter(Boolean).join('\n');
      const confirmed = window.confirm(
        `当前生成需要使用 AI 适配：\n\n${reasonText}\n\nAI 将用于扩图、裁切、构图调整、背景补全、主体位置调整、安全区避让和智能排版。是否继续？`
      );
      if (!confirmed) return;
    }

    setIsProcessing(true);
    setProcessedAssets([]);
    setGenerationProgress({ current: 0, total: rawFiles.length * activeTemplates.length });

    // NOTE: 先插入所有占位 loading 卡，让用户即时看到即将生成的卡片数量
    const placeholders: AdAsset[] = [];
    for (const raw of rawFiles) {
      for (const template of activeTemplates) {
        const target = getTemplateOutputDimensions(template);
        const shouldShowAiLoading =
          STANDARD_BOARD_EXTERNAL_IMAGE_ADAPTATION_ENABLED &&
          raw.file.type.startsWith('image/') &&
          requiresAiAdaptation &&
          !(activeTemplates.length === 1 && isRawImageMatchingTemplate(raw, template));
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
          loadingMode: shouldShowAiLoading ? 'ai' : 'standard',
          loadingLabel: shouldShowAiLoading ? 'AI 正在智能排版' : '正在生成预览',
          loadingHint: shouldShowAiLoading
            ? `拆解画面、延展背景，适配 ${target ? `${target.width} x ${target.height}` : (template.dimensions || '目标尺寸')}`
            : `${template.app}${template.name}`,
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
        let aiAdaptation: AdAsset['aiAdaptation'] | undefined;
        const shouldBypassAiForExactImage = raw.file.type.startsWith('image/') && activeTemplates.length === 1 && isRawImageMatchingTemplate(raw, template);

        // category check
        const isSplash = template.category === '开屏';
        const isWink = template.app === 'wink';
        const isMeiyan = template.app === '美颜';
        const focalHeight = isWink ? 1410 : (isMeiyan ? 1128 : 900);

        // Precise classification for Focal Windows
        const isStaticFocal = template.category === '焦点视窗' && template.name.includes('静态') && !template.name.includes('沉浸式');
        const isDynamicFocal = template.category === '焦点视窗' && (['mt-f-1', 'my-f-1', 'wk-f-1'].includes(template.id) || template.name.includes('动态')) && !template.name.includes('沉浸式');
        const isImmersive = template.category === '焦点视窗' && template.name.includes('沉浸式'); // Assuming Immersive is mostly static images or specific logic
        const isNonFullscreenSplash = template.id === 'mt-s-5' || template.id === 'mt-s-6' || template.name.includes('非全屏');

        const isHotRecommend = template.id === 'mt-ib-1';
        const isHotSearch = template.id === 'mt-ib-2';
        const isTopicBg = template.id === 'mt-ib-3';
        const isTopicBanner = template.id === 'mt-ib-4';
        const isScorePopup = template.id === 'mt-p-1';
        const isHomePopup = template.id === 'mt-p-2' || template.id === 'mt-p-3';
        // NOTE: 一键配方图文，信息流模板，裁剪至 720x960
        const isRecipeContent = template.id === 'mt-fe-1';
        const isMts1 = template.id === 'mt-s-1';
        const processSplashFrame = async (seekPoint: 'start' | 'end') => {
          const capturedFrame = await captureVideoFrame(raw.file, seekPoint);
          if (!capturedFrame) return raw.previewUrl;
          const resp = await fetch(capturedFrame);
          const blob = await resp.blob();
          const file = new File([blob], seekPoint === 'end' ? 'splash_last_frame.jpg' : 'splash_first_frame.jpg', { type: 'image/jpeg' });
          const compressed = await smartCropImage(file, 1440, isNonFullscreenSplash ? 1938 : 2340, 200);
          return compressed?.url ? `${ASSETS_URL}${compressed.url}` : capturedFrame;
        };

        const expandVideoToTemplate = async (target: { width: number; height: number }) => {
          console.log(`[AIGC Video Expand] ${raw.file.name} -> ${template.app}${template.name} ${target.width}x${target.height}`);
          const uploaded = await uploadRawAsset(raw.file);
          const aigcResult = await expandVideoWithAigc({
            videoUrl: uploaded.url,
            targetWidth: target.width,
            targetHeight: target.height,
            prompt: [
              '将上传视频智能适配为目标尺寸。保持主体、产品、文案和 Logo 完整不变，不拉伸、不变形、不改字、不重绘 Logo。根据目标尺寸比例自动扩展背景并优化排版，使画面美观、平衡、有广告设计感。',
              '文案和 Logo 必须距离画面边缘至少 15% 安全距离，避免裁切。禁止裁切主体、文字错乱、Logo 变形、比例异常。',
              `广告模板：${template.app}${template.name}`,
              `目标尺寸：${target.width} x ${target.height}`
            ].join('。'),
            out_fps: 24,
            start_idx: 0,
            max_num_frames: 81,
            mixed_precision: 'bf16',
            seed: 123
          });
          return aigcResult.resultUrl.startsWith('http') ? aigcResult.resultUrl : `${ASSETS_URL}${aigcResult.resultUrl}`;
        };

        const shouldUseAigcForImageAdaptation =
          STANDARD_BOARD_EXTERNAL_IMAGE_ADAPTATION_ENABLED &&
          raw.file.type.startsWith('image/') &&
          requiresAiAdaptation &&
          !shouldBypassAiForExactImage;
        const aigcTarget = getTemplateOutputDimensions(template);

        // 1. If Workflow exists -> Try ComfyUI -> Fallback to Smart Crop (if image) or Thumbnail (if video)
        // Special handling: If splash frame capture is enabled, skip workflow entirely
        const shouldCaptureFrame = isSplash && isVideo && (config.captureFirstFrame || config.captureLastFrameSplash);
        const shouldUseAigcForVideoAdaptation =
          STANDARD_BOARD_AIGC_VIDEO_ADAPTATION_ENABLED &&
          isVideo &&
          Boolean(aigcTarget) &&
          !shouldCaptureFrame &&
          !isStaticFocal &&
          !isImmersive &&
          (
            !raw.videoDimensions ||
            raw.videoDimensions.width !== aigcTarget?.width ||
            raw.videoDimensions.height !== aigcTarget?.height ||
            activeTemplates.length > 1
          );

        if (shouldBypassAiForExactImage) {
          console.log(`[AI Gate] ${raw.file.name} matches ${template.name}; skip AI adaptation and use direct template compositing.`);
        }
        else if (shouldUseAigcForImageAdaptation && aigcTarget) {
          try {
            console.log(`[AIGC Adapt] ${raw.file.name} -> ${template.app}${template.name} ${aigcTarget.width}x${aigcTarget.height}`);
            const uploaded = await uploadRawAsset(raw.file);
            const imageAdaptPrompt = [
              'Highest priority: preserve the uploaded poster content exactly. Keep the original product, subject, logo, slogan, readable copy, button and brand marks unchanged.',
              'Use detected layers only to move, scale and arrange existing original visual elements into the target ad size. Keep text and logo inside safe areas.',
              'Do not create or add any new objects, decorative elements, products, people, icons, labels, words, captions, slogans, logos, buttons, stickers, badges, UI elements, packaging or unrelated background content.',
              'Do not generate fake text, fake letters, fake logos, fake signs, watermarks or extra marketing copy.',
              'If extra canvas area is needed, extend only the original background texture, color, lighting and perspective. Prefer clean empty background over adding any content.',
              'The result must look like the same original poster adapted to a new size, not a redesigned poster.',
              `Template: ${template.app}${template.name}`,
              `Target size: ${aigcTarget.width} x ${aigcTarget.height}`
            ].join(' ');
            const aigcResult = await adaptImageWithAigc({
              imageUrl: uploaded.url,
              targetWidth: aigcTarget.width,
              targetHeight: aigcTarget.height,
              templateId: template.id,
              templateName: template.name,
              app: template.app,
              prompt: imageAdaptPrompt,
              allowRelayout: true
            });
            if (aigcResult.qa && !aigcResult.qa.passed) {
              console.warn('[AIGC Adapt] QA warnings', aigcResult.qa.warnings);
            }
            console.log('[AIGC Adapt] diagnostic', {
              strategy: aigcResult.strategy,
              planStrategy: aigcResult.plan?.strategy,
              layeredRelayout: aigcResult.layeredRelayout,
              analysis: aigcResult.analysis,
              qa: aigcResult.qa,
            });
            aiAdaptation = describeAdaptImageResult(aigcResult);
            console.log('[AIGC Adapt] result mode', aiAdaptation);
            finalUrl = aigcResult.resultUrl.startsWith('http') ? aigcResult.resultUrl : `${ASSETS_URL}${aigcResult.resultUrl}`;
          } catch (e) {
            console.error('[AIGC Adapt] failed', e);
            const message = getRequestErrorMessage(e);
            alert(`美图 AI 适配失败，已停止生成：\n\n${raw.file.name} -> ${template.app}${template.name}\n${message}`);
            setProcessedAssets(results);
            setIsProcessing(false);
            setGenerationProgress(null);
            return;
          }
        }
        else if (shouldUseAigcForVideoAdaptation && aigcTarget) {
          try {
            finalUrl = await expandVideoToTemplate(aigcTarget);
          } catch (e) {
            console.error('[AIGC Video Expand] failed', e);
            const message = getRequestErrorMessage(e);
            alert(`美图 AI 视频扩展失败，已停止生成：\n\n${raw.file.name} -> ${template.app}${template.name}\n${message}`);
            setProcessedAssets(results);
            setIsProcessing(false);
            setGenerationProgress(null);
            return;
          }
        }
        else if (shouldCaptureFrame) {
          // Skip workflow, directly capture and process selected frame
          const seekPoint = config.captureLastFrameSplash ? 'end' : 'start';
          console.log(`[Splash Debug] ${seekPoint} frame capture enabled for ${template.id}, skipping workflow...`);
          try {
            finalUrl = await processSplashFrame(seekPoint);
            console.log(`[Splash Debug] ${seekPoint} frame captured and processed: ${finalUrl}`);
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
                  const targetH = isNonFullscreenSplash ? 1938 : (isImmersive ? 2340 : (isStaticFocal ? focalHeight : (isHotRecommend ? 960 : 2340)));

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
                const h = isNonFullscreenSplash ? 1938 : (isImmersive ? 2340 : (isStaticFocal ? focalHeight : ((isHotRecommend || isHomePopup) ? 960 : 2340)));

                const limitKB = (isSplash || template.category === '焦点视窗') ? 200 : 250;
                const smart = await smartCropImage(raw.file, w, h, limitKB);
                if (smart?.url) {
                  finalUrl = `${ASSETS_URL}${smart.url}`;
                  console.log(`Fallback to Smart Crop (${w}x${h}) success`);
                }
              } catch (e) { console.error("Smart Crop fallback failed", e); }
            } else if (raw.file.type.startsWith('video/')) {
              // Splash fallback logic
              if (isSplash && (config.captureFirstFrame || config.captureLastFrameSplash)) {
                const seekPoint = config.captureLastFrameSplash ? 'end' : 'start';
                console.log(`[Splash Debug] Capturing ${seekPoint} frame for ${template.id}`);
                try {
                  finalUrl = await processSplashFrame(seekPoint);
                } catch (e) {
                  console.error('[Splash Debug] Frame processing failed:', e);
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
        // 3. Splash Video (No Workflow)
        else if (isSplash && raw.file.type.startsWith('video/')) {
          if (config.captureFirstFrame || config.captureLastFrameSplash) {
            try {
              finalUrl = await processSplashFrame(config.captureLastFrameSplash ? 'end' : 'start');
            } catch (e) {
              console.error('[Splash Debug] Direct frame processing failed:', e);
              finalUrl = raw.previewUrl;
            }
          } else finalUrl = raw.previewUrl;
        }
        // 4. Static Focal Window + Image -> Force Smart Crop (1126 x focalHeight)
        else if ((isStaticFocal || isImmersive) && raw.file.type.startsWith('image/')) {
          try {
            const w = isImmersive ? 1440 : 1126;
            const h = isImmersive ? 2340 : focalHeight;
            const smart = await smartCropImage(raw.file, w, h, 250);
            if (smart?.url) finalUrl = `${ASSETS_URL}${smart.url}`;
          } catch (e) {
            console.error("Smart extract/crop failed", e);
          }
        }
        // Static/immersive focal windows keep uploaded videos playable in generated previews.
        else if ((isStaticFocal || isImmersive) && raw.file.type.startsWith('video/')) {
          finalUrl = raw.previewUrl;
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
        // 9.1 Score Popup (保分页弹窗) + Video -> 960x1440 / 5s, optional frame 0 capture
        else if (isScorePopup && raw.file.type.startsWith('video/')) {
          try {
            const meta = await getVideoMeta(raw.file);
            if (meta.duration > 5) {
              console.warn(`[mt-p-1] 视频 ${meta.duration.toFixed(1)}s 超过 5s，保存时会按前 5s 合成处理`);
            }
            if (meta.width !== 960 || meta.height !== 1440) {
              console.warn(`[mt-p-1] 视频尺寸 ${meta.width}x${meta.height}，目标尺寸为 960x1440，保存时会按 960x1440 适配`);
            }

            if (config.captureFirstFrameMtP1) {
              const firstFrame = await captureVideoFrame(raw.file, 'start');
              if (firstFrame) {
                const resp = await fetch(firstFrame);
                const blob = await resp.blob();
                const frameFile = new File([blob], 'score_popup_frame0.jpg', { type: 'image/jpeg' });
                const smart = await smartCropImage(frameFile, 960, 1440, 250);
                finalUrl = smart?.url ? `${ASSETS_URL}${smart.url}` : firstFrame;
              }
            } else {
              finalUrl = raw.previewUrl;
            }
          } catch (e) {
            console.error("[mt-p-1] Score Popup video handling failed", e);
            finalUrl = raw.previewUrl;
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
          // NOTE: mt-f-1 动态焦点视窗 + 开启「截取第0帧」→ 截取视频第0帧并合成为静态图
          if (template.id === 'mt-f-1' && config.captureFirstFrameMtF1) {
            try {
              console.log(`[mt-f-1] captureFirstFrameMtF1 enabled, capturing frame 0...`);
              const firstFrame = await captureVideoFrame(raw.file, 'start');
              if (firstFrame) {
                const resp = await fetch(firstFrame);
                const blob = await resp.blob();
                const frameFile = new File([blob], 'first_frame_mtf1.jpg', { type: 'image/jpeg' });
                const smart = await smartCropImage(frameFile, 1126, focalHeight, 250);
                if (smart?.url) {
                  finalUrl = `${ASSETS_URL}${smart.url}`;
                  console.log(`[mt-f-1] Frame 0 captured and cropped to 1126x${focalHeight}: ${finalUrl}`);
                } else {
                  finalUrl = firstFrame;
                }
              }
            } catch (e) {
              console.error('[mt-f-1] Frame 0 capture failed, falling back to video', e);
              finalUrl = raw.previewUrl;
            }
          }
          // NOTE: mt-f-1 动态焦点视窗 + 开启「截取最后一帧」→ 截取视频最后一帧并合成为静态图
          else if (template.id === 'mt-f-1' && config.captureLastFrameMtF1) {
            try {
              console.log(`[mt-f-1] captureLastFrameMtF1 enabled, seeking to end...`);
              const lastFrame = await captureVideoFrame(raw.file, 'end');
              if (lastFrame) {
                const resp = await fetch(lastFrame);
                const blob = await resp.blob();
                const forceJpeg = isSplash || template.category === '焦点视窗';
                const frameFile = new File([blob], forceJpeg ? 'last_frame_mtf1.jpg' : 'last_frame_mtf1.png', { type: forceJpeg ? 'image/jpeg' : 'image/png' });
                const smart = await smartCropImage(frameFile, 1126, focalHeight, 250);
                if (smart?.url) {
                  finalUrl = `${ASSETS_URL}${smart.url}`;
                  console.log(`[mt-f-1] Last frame captured and cropped to 1126x${focalHeight}: ${finalUrl}`);
                } else {
                  finalUrl = lastFrame;
                }
              }
            } catch (e) {
              console.error('[mt-f-1] Last frame capture failed, falling back to video', e);
              finalUrl = raw.previewUrl;
            }
          }
          // NOTE: my-f-1 美颜动态焦点视窗 + 开启「截取第一帧」→ 截取视频第一帧并合成为静态图
          else if (template.id === 'my-f-1' && config.captureFirstFrameMyF1) {
            try {
              console.log(`[my-f-1] captureFirstFrameMyF1 enabled, capturing first frame...`);
              let thumb = raw.thumbnailUrl;
              if (!thumb) thumb = await captureVideoFrame(raw.file, 'start');
              if (thumb) {
                const resp = await fetch(thumb);
                const blob = await resp.blob();
                const forceJpeg = isSplash || template.category === '焦点视窗';
                const frameFile = new File([blob], forceJpeg ? 'first_frame_myf1.jpg' : 'first_frame_myf1.png', { type: forceJpeg ? 'image/jpeg' : 'image/png' });
                const smart = await smartCropImage(frameFile, 1284, focalHeight, 250);
                if (smart?.url) {
                  finalUrl = `${ASSETS_URL}${smart.url}`;
                  console.log(`[my-f-1] First frame captured and cropped to 1284x${focalHeight}: ${finalUrl}`);
                } else {
                  finalUrl = thumb;
                }
              }
            } catch (e) {
              console.error('[my-f-1] First frame capture failed, falling back to video', e);
              finalUrl = raw.previewUrl;
            }
          }
          // NOTE: my-f-1 美颜动态焦点视窗 + 开启「截取最后一帧」→ 截取视频最后一帧并合成为静态图
          else if (template.id === 'my-f-1' && config.captureLastFrameMyF1) {
            try {
              console.log(`[my-f-1] captureLastFrameMyF1 enabled, capturing last frame...`);
              const lastFrame = await captureVideoFrame(raw.file, 'end');
              if (lastFrame) {
                const resp = await fetch(lastFrame);
                const blob = await resp.blob();
                const frameFile = new File([blob], 'last_frame_myf1.jpg', { type: 'image/jpeg' });
                const smart = await smartCropImage(frameFile, 1284, focalHeight, 250);
                if (smart?.url) {
                  finalUrl = `${ASSETS_URL}${smart.url}`;
                  console.log(`[my-f-1] Last frame captured and cropped to 1284x${focalHeight}: ${finalUrl}`);
                } else {
                  finalUrl = lastFrame;
                }
              }
            } catch (e) {
              console.error('[my-f-1] Last frame capture failed, falling back to video', e);
              finalUrl = raw.previewUrl;
            }
          }
          // NOTE: wk-f-1 Wink 动态焦点视窗 + 开启「截取最后一帧」→ 截取视频最后一帧并合成为静态图
          else if (template.id === 'wk-f-1' && config.captureLastFrameWkF1) {
            try {
              console.log(`[wk-f-1] captureLastFrameWkF1 enabled, capturing last frame...`);
              const lastFrame = await captureVideoFrame(raw.file, 'end');
              if (lastFrame) {
                const resp = await fetch(lastFrame);
                const blob = await resp.blob();
                const frameFile = new File([blob], 'last_frame_wkf1.jpg', { type: 'image/jpeg' });
                const smart = await smartCropImage(frameFile, 1126, focalHeight, 250);
                if (smart?.url) {
                  finalUrl = `${ASSETS_URL}${smart.url}`;
                  console.log(`[wk-f-1] Last frame captured and cropped to 1126x${focalHeight}: ${finalUrl}`);
                } else {
                  finalUrl = lastFrame;
                }
              }
            } catch (e) {
              console.error('[wk-f-1] Last frame capture failed, falling back to video', e);
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
            // NOTE: mt-f-1 截取第0帧或最后一帧时，输出为静态图
            if (template.id === 'mt-f-1' && (config.captureFirstFrameMtF1 || config.captureLastFrameMtF1)) return 'image/png';
            // NOTE: my-f-1 截取第一帧时，输出为静态图
            if (template.id === 'my-f-1' && (config.captureFirstFrameMyF1 || config.captureLastFrameMyF1)) return 'image/png';
            // NOTE: wk-f-1 截取最后一帧时，输出为静态图
            if (template.id === 'wk-f-1' && config.captureLastFrameWkF1) return 'image/png';
            // NOTE: mt-p-1 保分页弹窗截取第 0 帧时，输出为静态图
            if (template.id === 'mt-p-1' && config.captureFirstFrameMtP1) return 'image/jpeg';
            if (isSplash && (config.captureFirstFrame || config.captureLastFrameSplash)) {
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
                (isStaticFocal && (raw.file.type.startsWith('image/') || true)) ? `${isMeiyan ? 1284 : 1126} x ${focalHeight}` :
                  // NOTE: 动态焦点视窗尺寸固定位 1126 x focalHeight
                  (isDynamicFocal) ? `${isMeiyan ? 1284 : 1126} x ${focalHeight}` :
                    (isHotRecommend || isHomePopup) ? '720 x 960' :
                      (isScorePopup) ? '960 x 1440' :
                        (isTopicBg && raw.file.type.startsWith('image/')) ? '1126 x 640' :
                          (isRecipeContent && raw.file.type.startsWith('image/')) ? '720 x 960' :
                            (template.dimensions || '1080 x 1920'),
          splashText: (template.category === '开屏' || template.id === 'mt-p-1') ? config.splashText : undefined,
          maskUrl: template.mask_path ? `${template.mask_path}?v=${config.assetsVersion}` : null,
          cropOverlayUrl: template.crop_overlay_path ? `${template.crop_overlay_path}?v=${config.assetsVersion}` : null,
          badgeOverlayUrl: template.badge_overlay_path ? `${template.badge_overlay_path}?v=${config.assetsVersion}` : null,
          showBadge: template.category === '焦点视窗' && !!template.badge_overlay_path,
          aiAdaptation,
          // NOTE: 三平台开屏样式 — 查找同 splashGroup 的三个平台蒙版路径
          ...(template.category === '开屏' && template.splashGroup ? (() => {
            const meituTpl = templates.find(t => t.category === '开屏' && t.app === '美图秀秀' && t.splashGroup === template.splashGroup);
            const beautyTpl = templates.find(t => t.category === '开屏' && t.app === '美颜' && t.splashGroup === template.splashGroup);
            const winkTpl = templates.find(t => t.category === '开屏' && t.app === 'wink' && t.splashGroup === template.splashGroup);
            return {
              splashPlatformMasks: {
                meitu: meituTpl?.mask_path ? `${meituTpl.mask_path}?v=${config.assetsVersion}` : null,
                beauty: beautyTpl?.mask_path ? `${beautyTpl.mask_path}?v=${config.assetsVersion}` : null,
                wink: winkTpl?.mask_path ? `${winkTpl.mask_path}?v=${config.assetsVersion}` : null,
              },
              activeSplashStyle: 'meitu' as const,
            };
          })() : {}),
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
              if (isSplash && (config.captureFirstFrame || config.captureLastFrameSplash)) return 'image/png';
              if (finalUrl.startsWith('data:') || finalUrl.match(/\.(png|jpg|jpeg|webp)$/i)) return 'image/png';
              return 'video/mp4';
            })(),
            captureFirstFrame: config.captureFirstFrame,
            captureLastFrameSplash: config.captureLastFrameSplash,
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
          const res = await incrementTemplateUsage(tpl.id, getVisitorId());
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
    <div className="min-h-screen bg-[#F8F9FB] selection:bg-primary/10 selection:text-primary">
      <Header onOpenAdmin={() => {
        setAdminPasswordInput('');
        setAdminPasswordError(false);
        setShowAdminPasswordModal(true);
      }} />

      <Routes>
        <Route path="/config" element={<ConfigWorkspace />} />
        <Route path="/" element={
          <DashboardWorkspace
            t={t}
            templates={templates}
            config={config}
            rawFiles={rawFiles}
            processedAssets={processedAssets}
            isProcessing={isProcessing}
            isDragging={isDragging}
            isCollapsed={isCollapsed}
            generationProgress={generationProgress}
            fileInputRef={fileInputRef}
            handleTemplateToggle={handleTemplateToggle}
            handleConfigChange={handleConfigChange}
            handleTemplateUpdate={handleTemplateUpdate}
            handleGenerate={handleGenerate}
            handleFileUpload={handleFileUpload}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            removeRawFile={removeRawFile}
            setRawFiles={setRawFiles}
            setProcessedAssets={setProcessedAssets}
            handleUpdateAsset={handleUpdateAsset}
            handleBatchDownload={handleBatchDownload}
          />
        } />
      </Routes>

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
                  if (adminPasswordInput === '0000') {
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
                  if (adminPasswordInput === '0000') {
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

      {showAdmin && <AdminDashboard onClose={() => { setShowAdmin(false); loadTemplates(); }} />}
    </div>
  );
};

export default App;
