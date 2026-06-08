import axios from 'axios';
import { AdTemplate, AdAsset, AnalyticsSummary } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';
export const ASSETS_URL = API_URL.replace('/api', '');

export const api = axios.create({
    baseURL: API_URL,
});

api.interceptors.response.use(
    response => response,
    error => {
        const data = error?.response?.data;
        const detail = data?.details || data?.error || data?.message;
        if (detail) {
            error.message = detail;
        }
        return Promise.reject(error);
    }
);

export const getTemplates = async (): Promise<AdTemplate[]> => {
    const response = await api.get<AdTemplate[]>('/templates');
    return response.data;
};

export const createTemplate = async (data: any): Promise<AdTemplate> => {
    const response = await api.post<AdTemplate>('/templates', data);
    return response.data;
};

export const updateTemplate = async (id: string, data: Partial<AdTemplate>): Promise<AdTemplate> => {
    const response = await api.put<AdTemplate>(`/templates/${id}`, data);
    return response.data;
};

export const deleteTemplate = async (id: string): Promise<void> => {
    await api.delete(`/templates/${id}`);
};

export const reorderTemplates = async (templates: AdTemplate[]): Promise<void> => {
    await api.post('/templates/reorder', { templates });
};

export const incrementTemplateUsage = async (id: string, visitorId?: string): Promise<{ success: boolean; processedCount: number }> => {
    const response = await api.post(`/templates/${id}/increment`, { visitorId, board: 'standard' });
    return response.data;
};

export const reportVisit = async (visitorId: string, board: 'standard' | 'creative' = 'standard', path = window.location.pathname): Promise<void> => {
    await api.post('/analytics/visit', { visitorId, board, path });
};

export const getAnalyticsSummary = async (): Promise<AnalyticsSummary> => {
    const response = await api.get<AnalyticsSummary>('/analytics/summary');
    return response.data;
};

export const uploadMask = async (id: string, file: File): Promise<{ mask_path: string }> => {
    const formData = new FormData();
    formData.append('mask', file);
    const response = await api.post<{ mask_path: string }>(`/templates/${id}/mask`, formData);
    return response.data;
};

export const uploadCropOverlay = async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    // NOTE: 使用相对路径，避免与 axios baseURL 重复拼接导致 404
    const response = await api.post(`/templates/${id}/crop-overlay`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const uploadBadgeOverlay = async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    // NOTE: 使用相对路径，避免与 axios baseURL 重复拼接导致 404
    const response = await api.post(`/templates/${id}/badge-overlay`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const uploadTemplatePreviewVideo = async (id: string, file: File): Promise<{ preview_video_path: string }> => {
    const formData = new FormData();
    formData.append('video', file);
    const response = await api.post<{ preview_video_path: string }>(`/templates/${id}/preview-video`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const exportVideoWithSize = async (payload: {
    url: string;
    width: number;
    height: number;
    maxDurationSec?: number;
}): Promise<{ ok: boolean; url: string; width: number; height: number; sizeMB?: number }> => {
    const response = await api.post('/export-video', payload);
    return response.data;
};

export const getWorkflows = async () => {
    const response = await api.get('/workflows');
    return response.data;
};

export const uploadWorkflow = async (file: File) => {
    const formData = new FormData();
    formData.append('workflow', file);
    formData.append('name', file.name.replace(/\.json$/i, ''));
    const response = await api.post('/workflows', formData);
    return response.data;
};

export const uploadRawAsset = async (file: File): Promise<{ url: string, path: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/upload', formData);
    return response.data;
};

export const generateComfyUI = async (workflowId: string, params: any) => {
    const response = await api.post('/comfyui/generate', { workflowId, params });
    return response.data;
};

export const generatePendantAsset = async (prompt: string): Promise<{ url: string; provider: string; message: string }> => {
    const response = await api.post('/creative/dynamic-splash/pendant', { prompt });
    return response.data;
};

export const smartCropImage = async (file: File, width = 1440, height = 2340, maxSizeKB = 200) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('width', width.toString());
    formData.append('height', height.toString());
    formData.append('maxSizeKB', maxSizeKB.toString());

    const response = await api.post('/smart-crop', formData);
    return response.data;
};

export interface AigcImageExpandRequest {
    imageUrl: string;
    targetWidth?: number;
    targetHeight?: number;
    expandPixels?: { left: number; right: number; top: number; bottom: number };
    prompt?: string;
    seed?: number;
    highQuality?: boolean;
}

export interface AigcImageExpandResponse {
    ok: boolean;
    provider: string;
    task: string;
    taskId: string;
    resultUrl: string;
    remoteResultUrl?: string;
    freeExpandPixel: { left: number; right: number; top: number; bottom: number };
    mediaInfo?: unknown;
    raw?: unknown;
}

export const expandImageWithAigc = async (payload: AigcImageExpandRequest): Promise<AigcImageExpandResponse> => {
    const response = await api.post<AigcImageExpandResponse>('/aigc/image-expand', payload);
    return response.data;
};

export interface AigcTaskResponse {
    ok: boolean;
    provider: string;
    task: string;
    taskId: string;
    resultUrl: string;
    remoteResultUrl?: string;
    target?: { width: number; height: number };
    aigcTarget?: { width: number; height: number };
    postProcess?: unknown;
    mediaInfo?: unknown;
    raw?: unknown;
}

export const generateImageWithAigc = async (payload: {
    prompt: string;
    ratio?: string;
    seed?: number;
    baseModelName?: string;
    transparentWhite?: boolean;
}): Promise<AigcTaskResponse> => {
    const response = await api.post<AigcTaskResponse>('/aigc/text-to-image', payload);
    return response.data;
};

export const outpaintImageWithAigc = async (payload: {
    imageUrl: string;
    prompt?: string;
    targetRatio?: string;
    baseModelName?: string;
}): Promise<AigcTaskResponse> => {
    const response = await api.post<AigcTaskResponse>('/aigc/image-outpaint', payload);
    return response.data;
};

export const editImageWithAigc = async (payload: {
    imageUrl: string;
    prompt: string;
    ratio?: string;
    seed?: number;
    baseModelName?: string;
    transparentWhite?: boolean;
}): Promise<AigcTaskResponse> => {
    const response = await api.post<AigcTaskResponse>('/aigc/image-to-image', payload);
    return response.data;
};

export const smartCropImageWithAigc = async (payload: {
    imageUrl: string;
    targetWidth: number;
    targetHeight: number;
    prompt?: string;
    baseModelName?: string;
}): Promise<AigcTaskResponse> => {
    const response = await api.post<AigcTaskResponse>('/aigc/smart-crop', payload);
    return response.data;
};

export const generateVideoWithAigc = async (payload: {
    prompt: string;
    ratio?: string;
    duration?: number;
    seed?: number;
    preferLtx?: boolean;
}): Promise<AigcTaskResponse> => {
    const response = await api.post<AigcTaskResponse>('/aigc/text-to-video', payload);
    return response.data;
};

export const animateImageWithAigc = async (payload: {
    imageUrl: string;
    prompt?: string;
    width?: number;
    height?: number;
    duration?: number;
    fps?: number;
    seed?: number;
    taskType?: string;
    loraId?: string;
}): Promise<AigcTaskResponse> => {
    const response = await api.post<AigcTaskResponse>('/aigc/image-to-video', payload);
    return response.data;
};

export const expandVideoWithAigc = async (payload: {
    videoUrl: string;
    targetWidth?: number;
    targetHeight?: number;
    r_w_left?: number;
    r_w_right?: number;
    r_h_up?: number;
    r_h_down?: number;
    prompt?: string;
    out_fps?: number;
    start_idx?: number;
    max_num_frames?: number;
    mixed_precision?: string;
    seed?: number;
}): Promise<AigcTaskResponse> => {
    const response = await api.post<AigcTaskResponse>('/aigc/video-expand', payload);
    return response.data;
};

export const clipVideoWithAigc = async (payload: {
    videoIdOrUrl: string;
    clipVideoLength?: string | number;
}): Promise<AigcTaskResponse> => {
    const response = await api.post<AigcTaskResponse>('/aigc/video-clip', payload);
    return response.data;
};

export const composeImageWithAigc = async (payload: {
    backgroundPicName: string;
    foregroundPicUrl: string;
    rectX?: number;
    rectY?: number;
    rectW: number;
    rectH: number;
    type?: number;
}): Promise<AigcTaskResponse> => {
    const response = await api.post<AigcTaskResponse>('/aigc/image-composition', payload);
    return response.data;
};

// NOTE: 系统全局设置（AI 增强模式）读取/保存
export interface SystemSettings {
    aiEnhancedMode: boolean;
    aiProvider: 'tongyi' | 'comfyui' | 'nanobanner';
    tongyiApiKey: string;
    tongyiApiKeyConfigured?: boolean;
    nanobannerApiKey: string;
    nanobannerBaseUrl: string;
    nanobannerApiKeyConfigured?: boolean;
    comfyuiUrl: string;
    /** 通义万象/美图/Nano Banner 扩图时的 Prompt */
    tongyiExpandPrompt?: string;
}

export interface CreativeTemplateSettings {
    interactionType: 'bubble-slide' | 'twist' | 'up-slide';
    cropAreaEnabled: boolean;
    platforms: Array<'xiuxiu' | 'meiyan' | 'wink'>;
}

export interface CreativeTemplateItem {
    id: string;
    groupId: string;
    groupName: string;
    name: string;
    dimensions: string;
    enabled: boolean;
    interaction_asset_path?: string;
    interaction_bubble_asset_path?: string;
    interaction_twist_asset_path?: string;
    interaction_up_asset_path?: string;
    crop_area_path?: string;
    platform_xiuxiu_path?: string;
    platform_meiyan_path?: string;
    platform_wink_path?: string;
}

export interface CreativeBoardSettings {
    creativeTemplateSettings: CreativeTemplateSettings;
}

export const getSettings = async (): Promise<SystemSettings> => {
    const response = await api.get<SystemSettings>('/settings');
    return response.data;
};

export const updateSettings = async (settings: Partial<SystemSettings>): Promise<void> => {
    await api.put('/settings', settings);
};

export const getCreativeSettings = async (): Promise<CreativeBoardSettings> => {
    const response = await api.get<CreativeBoardSettings>('/creative-settings');
    return response.data;
};

export const updateCreativeSettings = async (settings: Partial<CreativeBoardSettings>): Promise<void> => {
    await api.put('/creative-settings', settings);
};

export const getCreativeTemplates = async (): Promise<CreativeTemplateItem[]> => {
    const response = await api.get<CreativeTemplateItem[]>('/creative-templates');
    return response.data;
};

export const updateCreativeTemplate = async (id: string, data: Partial<CreativeTemplateItem>): Promise<CreativeTemplateItem> => {
    const response = await api.put<CreativeTemplateItem>(`/creative-templates/${id}`, data);
    return response.data;
};

export const uploadCreativeTemplateAsset = async (id: string, slot: string, file: File): Promise<CreativeTemplateItem> => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post<CreativeTemplateItem>(`/creative-templates/${id}/assets/${slot}`, formData);
    return response.data;
};

/**
 * 测试通义万象 API Key 连通性（无计费）
 * @param apiKey 可选，不传则使用后端已配置的 key
 */
export const testTongyiConnection = async (apiKey?: string): Promise<{ ok: boolean; message?: string; error?: string; quota?: string }> => {
    const response = await api.post<{ ok: boolean; message?: string; error?: string; quota?: string }>(
        '/tongyi/test',
        apiKey ? { apiKey } : {}
    );
    return response.data;
};

/**
 * 测试 Nano Banner API 连通性
 */
export const testNanobannerConnection = async (apiKey?: string, baseUrl?: string): Promise<{ ok: boolean; message?: string; error?: string }> => {
    const response = await api.post<{ ok: boolean; message?: string; error?: string }>(
        '/nanobanner/test',
        (apiKey && baseUrl) ? { apiKey, baseUrl } : {}
    );
    return response.data;
};

// API: Composite Video via FFmpeg
export const compositeVideo = async (
    videoBlob: Blob,
    bgBlob: Blob | null,
    fgBlob: Blob | null,
    params: { targetW: number, targetH: number, videoRect: { x: number, y: number, w: number, h: number }, maxSizeMB?: number, maxDurationSec?: number }
): Promise<any> => {
    const formData = new FormData();
    formData.append('video', videoBlob, 'source.mp4');
    if (bgBlob) formData.append('bgImage', bgBlob, 'bg.png');
    if (fgBlob) formData.append('fgImage', fgBlob, 'fg.png');
    formData.append('params', JSON.stringify(params));

    const response = await api.post('/composite-video', formData);
    return response.data;
};
