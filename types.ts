
export interface ColorScheme {
  iconColor: string;
  gradientColor: string;
}

export interface AdTemplate {
  id: string;
  name: string;
  app: '美图秀秀' | '美颜' | 'wink';
  category: '开屏' | '焦点视窗' | '信息流' | 'icon/banner' | '弹窗';
  checked: boolean;
  dimensions?: string;
  mask_path?: string | null;
  workflow_id?: string | null;
  crop_overlay_path?: string | null;
  badge_overlay_path?: string | null;
  preview_video_path?: string | null;
  // NOTE: 三平台开屏关联分组键（如 'dynamic', 'slide', 'twist', 'bubble', 'nonfull'）
  splashGroup?: string;
  // Per-template settings
  smartExtract?: boolean;
  iconColor?: string;
  gradientColor?: string;
  palette?: ColorScheme[];
  processedCount?: number;
}

export interface AdAsset {
  id: string;
  url: string;
  name: string;
  size: string;
  isCompressed: boolean;
  type: string;
  category: string;
  app: string;
  templateName: string;
  // NOTE: 生成等待占位状态，为 true 时卡片显示 loading 动画
  isLoading?: boolean;
  loadingMode?: 'ai' | 'standard';
  loadingLabel?: string;
  loadingHint?: string;
  aiExtractedColor?: string;
  gradientColor?: string;
  aiExtractedColors?: ColorScheme[];
  suggestedIcon?: string;
  dimensions: string;
  splashText?: string;
  maskUrl?: string | null;
  cropOverlayUrl?: string | null;
  badgeOverlayUrl?: string | null;
  showMask?: boolean;
  showCrop?: boolean;
  showBadge?: boolean;
  aiAdaptation?: {
    label: string;
    strategy?: string;
    warnings?: string[];
    debugLines?: string[];
    debugSummary?: {
      planStrategy?: string;
      layeredStatus?: string;
      layeredFailed?: boolean;
      relayoutExecuted?: boolean;
      subjectDetected?: boolean;
      logoDetected?: boolean;
      textDetected?: boolean;
      qaPassed?: boolean;
    };
  };
  // NOTE: 三平台开屏样式蒙版 — 存储三个平台各自的 mask_path
  splashPlatformMasks?: {
    meitu: string | null;
    beauty: string | null;
    wink: string | null;
  };
  // NOTE: 当前激活的平台样式（默认秀秀）
  activeSplashStyle?: 'meitu' | 'beauty' | 'wink';
}

export interface AdConfig {
  showMask: boolean;
  showCrop: boolean;
  splashText: string;
  captureFirstFrame: boolean;
  // NOTE: 开屏模版专属：是否截取视频最后一帧作为静态图输出
  captureLastFrameSplash?: boolean;
  // NOTE: my-f-1 美颜动态焦点视窗专属：是否截取视频第一帧作为静态图输出
  captureFirstFrameMyF1?: boolean;
  // NOTE: my-f-1 美颜动态焦点视窗专属：是否截取视频最后一帧作为静态图输出
  captureLastFrameMyF1?: boolean;
  // NOTE: wk-f-1 Wink 动态焦点视窗专属：是否截取视频最后一帧作为静态图输出
  captureLastFrameWkF1?: boolean;
  // NOTE: mt-p-1 保分页弹窗专属：是否截取视频第 0 帧作为静态图输出
  captureFirstFrameMtP1?: boolean;
  // NOTE: mt-f-1 动态焦点视窗专属：是否截取视频第 0 帧作为静态图输出
  captureFirstFrameMtF1?: boolean;
  // NOTE: mt-f-1 动态焦点视窗专属：是否截取视频最后一帧作为静态图输出
  captureLastFrameMtF1: boolean;
  assetsVersion: number;
}

export interface RawFile {
  id: string;
  file: File;
  previewUrl: string;
  thumbnailUrl?: string;
  imageDimensions?: {
    width: number;
    height: number;
  };
  videoDimensions?: {
    width: number;
    height: number;
    duration: number;
  };
}

export interface TemplateAnalyticsItem {
  id: string;
  name: string;
  app: string;
  category: string;
  board?: string;
  count: number;
}

export interface AnalyticsDaySummary {
  date: string;
  visits: number;
  generations: number;
  aiUsage?: {
    meituApi: number;
    gptImage2: number;
  };
  uniqueVisitors: number;
  templateUseCount: number;
}

export interface AnalyticsSummary {
  today: AnalyticsDaySummary & {
    topTemplates: TemplateAnalyticsItem[];
  };
  totals: {
    daysTracked: number;
    visits: number;
    generations: number;
    aiUsage?: {
      meituApi: number;
      gptImage2: number;
    };
    uniqueVisitors: number;
  };
  recentDays: AnalyticsDaySummary[];
  templateRanking: TemplateAnalyticsItem[];
}
