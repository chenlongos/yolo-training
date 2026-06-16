export interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  storage_used_bytes: number;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Dataset {
  id: string;
  project_id: string;
  name: string;
  description: string;
  current_version: number;
  image_count: number;
  created_at: string;
  updated_at: string;
}

export interface Image {
  id: string;
  dataset_id: string;
  filename: string;
  thumbnail_url?: string;
  image_url?: string;
  width: number;
  height: number;
  status: 'uploaded' | 'annotated' | 'reviewed';
}

export interface LabelClass {
  id: string;
  dataset_id: string;
  name: string;
  yolo_index: number;
  color: string;
  annotation_count?: number;
}

export interface Annotation {
  id: string;
  image_id: string;
  class_id: string;
  class_name: string;
  x_center: number;
  y_center: number;
  width: number;
  height: number;
}

export interface ModelConfig {
  id: string;
  project_id: string;
  name: string;
  base_model: string;
  epochs: number;
  imgsz: number;
  batch: number;
  device: string;
}

export interface TrainedModel {
  id: string;
  project_id: string;
  name: string;
  status: string;
  weights_path?: string;
  onnx_path?: string;
  fp16_onnx_path?: string;
  int8_onnx_path?: string;
  parent_model_id?: string;
  format_type?: string;
  metrics?: Record<string, number>;
  created_at: string;
}

export interface TrainingJob {
  id: string;
  model_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_epoch: number;
  total_epochs: number;
  current_metric?: Record<string, number>;
  error_message?: string;
  created_at: string;
}
