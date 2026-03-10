
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
}

export interface AdConfig {
  showMask: boolean;
  showCrop: boolean;
  showBadge?: boolean;
  splashText: string;
  captureFirstFrame: boolean;
  // NOTE: mt-f-1 动态焦点视窗专属：是否截取视频最后一帧作为静态图输出
  captureLastFrameMtF1: boolean;
  assetsVersion: number;
}
