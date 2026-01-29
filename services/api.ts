import axios from 'axios';
import { AdTemplate, AdAsset } from '../types';

const API_URL = 'http://localhost:8000/api';

export const api = axios.create({
    baseURL: API_URL,
});

export const getTemplates = async (): Promise<AdTemplate[]> => {
    const response = await api.get<AdTemplate[]>('/templates');
    return response.data;
};

export const updateTemplate = async (id: string, data: Partial<AdTemplate>): Promise<AdTemplate> => {
    const response = await api.put<AdTemplate>(`/templates/${id}`, data);
    return response.data;
};

export const deleteTemplate = async (id: string): Promise<void> => {
    await api.delete(`/templates/${id}`);
};

export const uploadMask = async (id: string, file: File): Promise<{ mask_path: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<{ mask_path: string }>(`/templates/${id}/mask`, formData);
    return response.data;
};

export const getWorkflows = async () => {
    const response = await api.get('/workflows');
    return response.data;
};

export const uploadWorkflow = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/workflows/upload', formData);
    return response.data;
};
