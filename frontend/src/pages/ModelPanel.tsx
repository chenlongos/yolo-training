import { Trash2, Download, Crosshair, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { TrainedModel, TrainingJob } from '../types';
import { models as modelApi } from '../api/endpoints';

interface Props {
  models: TrainedModel[];
  jobs: TrainingJob[];
  onSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onCancelJob: (id: string) => void;
  onInference?: (id: string) => void;
}

const FORMAT_LABELS: Record<string, { label: string; color: string }> = {
  pt: { label: 'PT', color: 'bg-gray-100 text-gray-700' },
  onnx: { label: 'ONNX', color: 'bg-amber-100 text-amber-700' },
  fp16_onnx: { label: 'FP16', color: 'bg-yellow-100 text-yellow-700' },
  int8_onnx: { label: 'INT8', color: 'bg-orange-100 text-orange-700' },
};

function getFormats(m: TrainedModel): { key: string; label: string; color: string; path?: string }[] {
  const fmts: { key: string; label: string; color: string; path?: string }[] = [];
  if (m.weights_path) fmts.push({ key: 'pt', ...FORMAT_LABELS.pt, path: m.weights_path });
  if (m.onnx_path) fmts.push({ key: 'onnx', ...FORMAT_LABELS.onnx, path: m.onnx_path });
  if ((m as any).fp16_onnx_path) fmts.push({ key: 'fp16_onnx', ...FORMAT_LABELS.fp16_onnx, path: (m as any).fp16_onnx_path });
  if ((m as any).int8_onnx_path) fmts.push({ key: 'int8_onnx', ...FORMAT_LABELS.int8_onnx, path: (m as any).int8_onnx_path });
  return fmts;
}

export default function ModelPanel({ models: list, jobs = [], onSelect, onDelete, onCancelJob, onInference }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="w-full">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">模型</h3>

      {/* 活跃的训练任务 */}
      {(jobs || []).filter(j => j.status === 'running' || j.status === 'queued').map(job => {
        const model = (list || []).find(m => m.id === job.model_id);
        return (
          <div key={job.id} className="bg-white rounded-xl border border-purple-200 shadow-sm p-4 mb-3 group">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${job.status === 'running' ? 'bg-purple-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-sm font-medium text-gray-700">{model?.name || '训练中'}</span>
                <span className="text-xs text-gray-400">{job.status === 'running' ? '训练中' : '排队中'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">{job.progress.toFixed(0)}%</span>
                <button onClick={() => onCancelJob(job.id)}
                  className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="取消训练">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
            </div>
            <p className="text-xs text-gray-500 font-mono">Epoch {job.current_epoch} / {job.total_epochs}</p>
            {job.current_metric && (
              <div className="grid grid-cols-3 gap-1.5 mt-3">
                {Object.entries(job.current_metric).slice(0, 6).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded p-1.5 text-center">
                    <div className="text-[9px] text-gray-500 truncate leading-tight">{k}</div>
                    <div className="text-[11px] font-bold text-purple-600 font-mono">{typeof v === 'number' ? v.toFixed(4) : String(v)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 已完成的模型 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(list || []).filter(m => m.status === 'completed').map(m => {
          const formats = getFormats(m);
          const isExpanded = expanded.has(m.id);
          return (
          <div key={m.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-800 text-sm cursor-pointer" onClick={() => onSelect(m.id)}>{m.name}</h4>
              <div className="flex items-center gap-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">done</span>
                <button onClick={(e) => { e.stopPropagation(); onDelete(m.id, m.name); }}
                  className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="删除模型">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {m.metrics && (
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(m.metrics).slice(0, 3).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded p-2 text-center">
                    <div className="text-[10px] text-gray-500">{k}</div>
                    <div className="text-xs font-bold text-violet-600 font-mono">{typeof v === 'number' ? v.toFixed(3) : String(v)}</div>
                  </div>
                ))}
              </div>
            )}
            {/* Format sub-items */}
            <button onClick={() => toggleExpand(m.id)}
              className="flex items-center gap-1 mt-3 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              模型格式 ({formats.length})
            </button>
            {isExpanded && (
              <div className="mt-2 space-y-1.5">
                {formats.map(f => (
                  <div key={f.key} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${f.color}`}>{f.label}</span>
                      <span className="text-xs text-gray-500">{f.key === 'pt' ? '训练权重' : f.key === 'fp16_onnx' ? '半精度' : f.key === 'int8_onnx' ? '量化' : '推理'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <a href={modelApi.downloadUrl(m.id, f.key)}
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer" title="下载">
                        <Download size={13} />
                      </a>
                      {onInference && (
                        <button onClick={(e) => { e.stopPropagation(); onInference(m.id); }}
                          className="p-1.5 rounded text-gray-400 hover:text-violet-600 hover:bg-violet-50 cursor-pointer" title="推理">
                          <Crosshair size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
        })}
      </div>

      {/* 其他状态的模型 */}
      {(list || []).filter(m => m.status !== 'completed').map(m => (
        <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 mt-2 group">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">{m.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{m.status}</span>
          </div>
          <button onClick={() => onDelete(m.id, m.name)}
            className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            title="删除模型">
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {(list || []).length === 0 && (jobs || []).length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">暂无模型，开始训练来创建</div>
      )}
    </div>
  );
}
