import { api } from './client';
import type { User, Project, Dataset, Image, Annotation, LabelClass, ModelConfig, TrainingJob, TrainedModel } from '../types';

const BASE = '/api/v1';

// Auth
export const auth = {
  register: (data: { username: string; email: string; password: string }) => api.post('/auth/register', data),
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  me: () => api.get('/auth/me') as Promise<User>,
};

// Projects
export const projects = {
  list: (page = 1) => api.get(`/projects?page=${page}`) as Promise<{ items: Project[]; total: number }>,
  create: (data: { name: string; description?: string }) => api.post('/projects', data) as Promise<Project>,
  get: (id: string) => api.get(`/projects/${id}`) as Promise<Project>,
  update: (id: string, data: Partial<Project>) => api.put(`/projects/${id}`, data) as Promise<Project>,
  delete: (id: string) => api.delete(`/projects/${id}`),
};

// Datasets
export const datasets = {
  list: (projectId: string) => api.get(`/projects/${projectId}/datasets`) as Promise<Dataset[]>,
  create: (projectId: string, data: { name: string; description?: string }) =>
    api.post(`/projects/${projectId}/datasets`, data) as Promise<Dataset>,
  get: (id: string) => api.get(`/datasets/${id}`) as Promise<Dataset>,
  delete: (id: string) => api.delete(`/datasets/${id}`),
  upload: (id: string, formData: FormData, onProgress?: (pct: number) => void) =>
    api.upload(`/datasets/${id}/upload`, formData, onProgress),
  images: (id: string, page = 1) =>
    api.get(`/datasets/${id}/images?page=${page}&per_page=200`) as Promise<{ items: Image[]; total: number }>,
  exportYolo: (id: string) => api.post(`/datasets/${id}/export/yolo`),
  classes: (id: string) => api.get(`/datasets/${id}/classes`) as Promise<LabelClass[]>,
  createClass: (id: string, data: { name: string; color?: string }) =>
    api.post(`/datasets/${id}/classes`, data) as Promise<LabelClass>,
};

// Images
export const images = {
  get: (id: string) => api.get(`/images/${id}`) as Promise<{ image: Image; annotations: Annotation[] }>,
  delete: (id: string) => api.delete(`/images/${id}`),
  getUrl: (id: string) => `${BASE}/images/${id}/file`,
  getThumbnailUrl: (id: string) => `${BASE}/images/${id}/thumbnail`,
};

// Annotations
export const annotations = {
  list: (imageId: string) => api.get(`/images/${imageId}/annotations`) as Promise<Annotation[]>,
  save: (imageId: string, data: { annotations: Omit<Annotation, 'id' | 'image_id' | 'class_name'>[] }) =>
    api.put(`/images/${imageId}/annotations`, data),
};

// Training
export const training = {
  createConfig: (projectId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/configs`, data) as Promise<ModelConfig>,
  startJob: (data: { model_config_id: string; dataset_id: string; name: string }) =>
    api.post('/training/jobs', data) as Promise<TrainingJob>,
  getJob: (id: string) => api.get(`/training/jobs/${id}`) as Promise<TrainingJob>,
  listJobs: (projectId?: string) =>
    api.get(`/training/jobs${projectId ? `?project_id=${projectId}` : ''}`) as Promise<{ items: TrainingJob[]; total: number }>,
  cancelJob: (id: string) => api.post(`/training/jobs/${id}/cancel`),
};

// Project-scoped data operations (auto-resolves dataset internally)
export const projectData = {
  upload: (projectId: string, formData: FormData, onProgress?: (pct: number) => void) =>
    api.upload(`/projects/${projectId}/upload`, formData, onProgress),
  images: (projectId: string, page = 1) =>
    api.get(`/projects/${projectId}/images?page=${page}&per_page=56`) as Promise<{ items: Image[]; total: number }>,
  exportYolo: (projectId: string) => api.post(`/projects/${projectId}/export/yolo`),
  classes: (projectId: string) => api.get(`/projects/${projectId}/classes`) as Promise<LabelClass[]>,
  createClass: (projectId: string, data: { name: string; color?: string }) =>
    api.post(`/projects/${projectId}/classes`, data) as Promise<LabelClass>,
};

// Models
export const models = {
  list: (projectId: string) =>
    api.get(`/models?project_id=${projectId}`) as Promise<{ items: TrainedModel[]; total: number }>,
  get: (id: string) => api.get(`/models/${id}`) as Promise<TrainedModel>,
  delete: (id: string) => api.delete(`/models/${id}`),
  downloadUrl: (id: string, format: string) => `${BASE}/models/${id}/download/${format}`,
  export: (id: string, format = 'onnx') => api.post(`/models/${id}/export?format=${format}`),
  compare: (ids: string[]) => api.get(`/models/compare/data?ids=${ids.join(',')}`),
};
