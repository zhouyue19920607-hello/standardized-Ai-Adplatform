
export interface AdTemplate {
  id: string;
  name: string;
  app: '美图秀秀' | '美颜' | 'wink';
  category: '开屏' | '焦点视窗' | '信息流' | 'icon/banner' | '弹窗';
  checked: boolean;
  dimensions?: string;
  mask_path?: string | null;
  workflow_id?: string | null;
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
  suggestedIcon?: string;
  dimensions: string;
  splashText?: string;
  maskUrl?: string | null;
}

export interface AdConfig {
  smartExtract: boolean;
  iconColor: string;
  gradientColor: string;
  showMask: boolean;
  splashText: string;
}
