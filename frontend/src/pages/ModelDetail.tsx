import { useState, useEffect, useRef } from 'react';
import { Trash2, Crosshair, Download, Loader2, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import type { TrainedModel } from '../types';
import { models as modelApi } from '../api/endpoints';
import { withUser } from '../api/client';

interface Props {
  model: TrainedModel;
  onDelete?: (id: string, name: string) => void;
  onInference?: (id: string) => void;
  onRefresh?: () => void;
}

interface CviProgress {
  status: string;
  progress: number;
  step: string;
  error: string;
  log: string;
}

const CONVERSIONS = [
  { key: 'onnx', label: 'ONNX (FP32)', desc: '全精度，跨平台推理' },
  { key: 'fp16_onnx', label: 'ONNX (FP16)', desc: '半精度，体积减半' },
  { key: 'int8_onnx', label: 'ONNX (INT8)', desc: '8-bit 量化，最小最快' },
  { key: 'cvimodel', label: 'CVI Model (cv181x)', desc: 'Sophon TPU，Docker 自动转换' },
];

export default function ModelDetail({ model: m, onDelete, onInference, onRefresh }: Props) {
  const [showConvert, setShowConvert] = useState(true);
  const [converting, setConverting] = useState<string | null>(null);
  const [convertError, setConvertError] = useState('');
  const [converted, setConverted] = useState<Set<string>>(new Set());
  const [cviProgress, setCviProgress] = useState<CviProgress | null>(null);
  const pollRef = useRef<number>(0);

  // Always check cvimodel status (on mount and when model changes)
  useEffect(() => {
    let cancelled = false;
    async function checkAndPoll() {
      try {
        const resp = await fetch(withUser(`/api/v1/models/${m.id}/conversion-status`));
        const p: CviProgress = await resp.json();
        if (cancelled) return;
        setCviProgress(p);

        if (p.status === 'running') {
          setConverting('cvimodel');
        } else if (p.status === 'completed') {
          setConverting(null);
          setConverted(prev => new Set(prev).add('cvimodel'));
        } else if (p.status === 'failed') {
          setConverting(null);
          setConvertError(p.error || '转换失败');
        }
      } catch {}
    }
    checkAndPoll();
    return () => { cancelled = true; };
  }, [m.id]);

  // Poll loop when converting=cvimodel
  useEffect(() => {
    if (converting !== 'cvimodel') return;
    async function poll() {
      try {
        const resp = await fetch(withUser(`/api/v1/models/${m.id}/conversion-status`));
        const p: CviProgress = await resp.json();
        setCviProgress(p);
        if (p.status === 'completed') {
          setConverted(prev => new Set(prev).add('cvimodel'));
          onRefresh?.();
          return; // stop polling
        }
        if (p.status === 'failed') {
          setConvertError(p.error || '转换失败');
          return; // stop polling
        }
        if (p.status !== 'running') {
          return; // idle, stop polling
        }
      } catch {
        // keep polling on network errors
      }
      pollRef.current = window.setTimeout(poll, 2000);
    }
    poll();
    return () => clearTimeout(pollRef.current);
  }, [converting]);

  async function handleConvert(format: string) {
    setConverting(format);
    setConvertError('');
    setCviProgress(null);
    try {
      const resp = await fetch(withUser(`/api/v1/models/${m.id}/export?format=${format}`), { method: 'POST' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).detail || `HTTP ${resp.status}`);
      }
      if (format !== 'cvimodel') {
        setConverted(prev => new Set(prev).add(format));
        onRefresh?.();
        setConverting(null);
      }
      // cvimodel: polling will handle completion
    } catch (e: any) {
      setConvertError(e.message || '转换失败');
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

              {/* CVI Model progress */}
              {cviProgress && converting === 'cvimodel' && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-violet-700">
                      {cviProgress.status === 'running' ? 'CVI Model 转换中' : cviProgress.status}
                    </span>
                    <span className="text-xs text-violet-500 font-mono">{cviProgress.progress}%</span>
                  </div>
                  <div className="h-2 bg-violet-200 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-600 rounded-full transition-all duration-500"
                      style={{ width: `${cviProgress.progress}%` }} />
                  </div>
                  {cviProgress.step && (
                    <p className="text-xs text-violet-600">{cviProgress.step}</p>
                  )}
                  {cviProgress.error && (
                    <p className="text-xs text-red-600 bg-red-50 rounded p-2">{cviProgress.error}</p>
                  )}
                  {cviProgress.log && (
                    <pre className="text-[10px] text-gray-600 bg-gray-900 text-green-400 rounded p-2 max-h-48 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                      {cviProgress.log}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
