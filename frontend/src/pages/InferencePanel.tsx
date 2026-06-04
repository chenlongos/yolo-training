import { useState, useRef } from 'react';
import { Upload, Play, Loader2, Crosshair } from 'lucide-react';
import type { TrainedModel } from '../types';

interface Detection {
  class: string;
  class_id: number;
  confidence: number;
  bbox: number[];
}

interface Props {
  models: TrainedModel[];
  activeModelId?: string;
}

export default function InferencePanel({ models, activeModelId }: Props) {
  const [selectedModel, setSelectedModel] = useState(activeModelId || '');
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ detections: Detection[]; count: number; result_url: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const completedModels = models.filter(m => m.status === 'completed' && m.weights_path);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImage({ file: f, url: URL.createObjectURL(f) });
    setResult(null);
    setError('');
  }

  async function runInference() {
    if (!selectedModel || !image) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', image.file);
      const resp = await fetch(`/api/v1/models/${selectedModel}/predict?conf=0.25`, {
        method: 'POST',
        body: fd,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).detail || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Inference failed');
    } finally {
      setLoading(false);
    }
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500';
  const lbl = 'text-xs text-gray-500 mb-1 block';

  return (
    <div className="w-full flex-1 space-y-5">
      <h3 className="text-sm font-semibold text-gray-800">实时推理</h3>

      {/* Model selector */}
      <div>
        <label className={lbl}>选择模型</label>
        <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className={inp}>
          <option value="">-- 选择已训练模型 --</option>
          {completedModels.map(m => (
            <option key={m.id} value={m.id}>{m.name}{m.metrics ? ` (mAP50: ${typeof m.metrics.mAP50 === 'number' ? m.metrics.mAP50.toFixed(3) : '-'})` : ''}</option>
          ))}
        </select>
        {completedModels.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">暂无已完成训练的模型</p>
        )}
      </div>

      {/* Image upload */}
      <div>
        <label className={lbl}>上传图片</label>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        {!image ? (
          <button onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl py-10 text-center hover:border-violet-400 hover:bg-violet-50/50 transition-colors cursor-pointer">
            <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
            <span className="text-sm text-gray-500">点击或拖拽上传图片</span>
          </button>
        ) : (
          <div className="relative">
            <img src={image.url} alt="preview" className="w-full max-h-64 object-contain rounded-lg border" />
            <button onClick={() => { setImage(null); setResult(null); }}
              className="absolute top-2 right-2 px-2 py-1 text-xs bg-white/90 rounded shadow hover:bg-white">更换</button>
          </div>
        )}
      </div>

      {/* Run button */}
      <button onClick={runInference} disabled={!selectedModel || !image || loading}
        className="w-full py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:bg-gray-300 transition-colors flex items-center justify-center gap-2 cursor-pointer">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {loading ? '推理中...' : '开始推理'}
      </button>

      {error && <div className="text-xs text-red-500 bg-red-50 rounded-lg p-3">{error}</div>}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {result.result_url && (
            <div>
              <label className={lbl}>推理结果</label>
              <img src={result.result_url} alt="result" className="w-full rounded-lg border" />
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Crosshair className="w-4 h-4 text-violet-500" />
            <span className="text-gray-700 font-medium">{result.count} 个检测结果</span>
          </div>
          {result.detections.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {result.detections.map((d, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <span className="text-gray-700 font-medium">{d.class}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">[{d.bbox.map(v => Math.round(v)).join(', ')}]</span>
                    <span className="text-violet-600 font-mono font-bold">{(d.confidence * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
