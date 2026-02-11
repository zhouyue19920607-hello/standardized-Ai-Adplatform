
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
  splashText: string;
  captureFirstFrame: boolean;
  assetsVersion: number;
}
