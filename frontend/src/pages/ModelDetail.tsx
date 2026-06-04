import { useState } from 'react';
import { Trash2, Crosshair, Download, Loader2, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import type { TrainedModel } from '../types';
import { models as modelApi } from '../api/endpoints';

interface Props {
  model: TrainedModel;
  onDelete?: (id: string, name: string) => void;
  onInference?: (id: string) => void;
  onRefresh?: () => void;
}

const CONVERSIONS = [
  { key: 'onnx', label: 'ONNX (FP32)', desc: '全精度，跨平台推理' },
  { key: 'fp16_onnx', label: 'ONNX (FP16)', desc: '半精度，体积减半' },
  { key: 'int8_onnx', label: 'ONNX (INT8)', desc: '8-bit 量化，最小最快' },
];

export default function ModelDetail({ model: m, onDelete, onInference, onRefresh }: Props) {
  const [showConvert, setShowConvert] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [convertError, setConvertError] = useState('');
  const [converted, setConverted] = useState<Set<string>>(new Set());

  async function handleConvert(format: string) {
    setConverting(format);
    setConvertError('');
    try {
      await fetch(`/api/v1/models/${m.id}/export?format=${format}`, { method: 'POST' });
      setConverted(prev => new Set(prev).add(format));
      onRefresh?.();
    } catch (e: any) {
      setConvertError(e.message || '转换失败');
    } finally {
      setConverting(null);
    }
  }

  return (
    <div className="w-full flex-1 bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{m.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{m.status}</span>
          {m.format_type && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">{m.format_type.replace('_', ' ').toUpperCase()}</span>}
        </div>
        <div className="flex items-center gap-2">
          {m.weights_path && onInference && (
            <button onClick={() => onInference(m.id)}
              className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 font-medium flex items-center gap-1">
              <Crosshair size={14} /> 推理
            </button>
          )}
          {m.weights_path && (
            <a href={modelApi.downloadUrl(m.id, 'pt')}
              className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-medium flex items-center gap-1">
              <Download size={14} /> 下载
            </a>
          )}
          {onDelete && (
            <button onClick={() => onDelete(m.id, m.name)}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              title="删除模型">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {m.metrics && (
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(m.metrics).map(([k, v]) => (
            <div key={k} className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">{k}</div>
              <div className="text-lg font-bold text-violet-600 font-mono mt-1">{typeof v === 'number' ? v.toFixed(3) : v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Model conversion — only for parent models (non-converted) */}
      {!m.parent_model_id && (
        <div>
          <button onClick={() => setShowConvert(!showConvert)}
            className="flex items-center gap-1 text-sm font-semibold text-gray-700 hover:text-gray-900 cursor-pointer">
            {showConvert ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            模型转换
          </button>
          {showConvert && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500">将模型转换为其他格式，转换后的模型会出现在模型列表中。</p>
              {CONVERSIONS.map(c => {
                const isDone = converted.has(c.key);
                const isBusy = converting === c.key;
                return (
                  <div key={c.key} className={`flex items-center justify-between rounded-lg p-3 border ${isDone ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div>
                      <span className="text-sm font-medium text-gray-800">{c.label}</span>
                      <p className="text-xs text-gray-500">{c.desc}</p>
                    </div>
                    {isDone ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <CheckCircle2 size={14} /> 已转换
                      </span>
                    ) : (
                      <button onClick={() => handleConvert(c.key)} disabled={!!converting}
                        className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 disabled:bg-gray-300 transition-colors cursor-pointer flex items-center gap-1">
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {isBusy ? '转换中' : '转换'}
                      </button>
                    )}
                  </div>
                );
              })}
              {convertError && <div className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{convertError}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
