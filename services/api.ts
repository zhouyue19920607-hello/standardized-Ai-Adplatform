import axios from 'axios';
import { AdTemplate, AdAsset } from '../types';

const API_URL = import.meta.env.VITE_API_URL || (['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:4000/api' : '/api');
export const ASSETS_URL = API_URL.replace('/api', '');

export const api = axios.create({
    baseURL: API_URL,
});

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

export const uploadMask = async (id: string, file: File): Promise<{ mask_path: string }> => {
    const formData = new FormData();
    formData.append('mask', file);
    const response = await api.post<{ mask_path: string }>(`/templates/${id}/mask`, formData);
    return response.data;
};

export const uploadCropOverlay = async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post(`${API_URL}/templates/${id}/crop-overlay`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const uploadBadgeOverlay = async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post(`${API_URL}/templates/${id}/badge-overlay`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
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

export const smartCropImage = async (file: File, width = 1440, height = 2340, maxSizeKB = 200) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('width', width.toString());
    formData.append('height', height.toString());
    formData.append('maxSizeKB', maxSizeKB.toString());

    const response = await api.post('/smart-crop', formData);
    return response.data;
};
