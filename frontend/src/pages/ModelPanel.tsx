import type { TrainedModel, TrainingJob } from '../types';
import { models as modelApi } from '../api/endpoints';

interface Props {
  models: TrainedModel[];
  jobs: TrainingJob[];
  onSelect: (id: string) => void;
}

export default function ModelPanel({ models: list, jobs, onSelect }: Props) {
  return (
    <div className="w-full">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">模型</h3>

      {/* 活跃的训练任务 */}
      {jobs.filter(j => j.status === 'running' || j.status === 'queued').map(job => {
        const model = list.find(m => m.id === job.model_id);
        return (
          <div key={job.id} className="bg-white rounded-xl border border-purple-200 shadow-sm p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${job.status === 'running' ? 'bg-purple-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-sm font-medium text-gray-700">{model?.name || '训练中'}</span>
                <span className="text-xs text-gray-400">{job.status === 'running' ? '训练中' : '排队中'}</span>
              </div>
              <span className="text-xs text-gray-500 font-mono">{job.progress.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
            </div>
            <p className="text-xs text-gray-500 font-mono">Epoch {job.current_epoch} / {job.total_epochs}</p>
            {job.current_metric && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {Object.entries(job.current_metric).slice(0, 4).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded p-2 text-center">
                    <div className="text-[10px] text-gray-500 truncate">{k}</div>
                    <div className="text-xs font-bold text-purple-600 font-mono">{typeof v === 'number' ? v.toFixed(3) : String(v)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 已完成的模型 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {list.filter(m => m.status === 'completed').map(m => (
          <div key={m.id} onClick={() => onSelect(m.id)}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 cursor-pointer hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-800 text-sm">{m.name}</h4>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">completed</span>
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
            {m.weights_path && (
              <a href={modelApi.downloadUrl(m.id, 'pt')} onClick={e => e.stopPropagation()}
                className="inline-block mt-3 px-3 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium">下载</a>
            )}
          </div>
        ))}
      </div>

      {/* 其他状态的模型 */}
      {list.filter(m => m.status !== 'completed').map(m => (
        <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 mt-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">{m.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{m.status}</span>
          </div>
        </div>
      ))}

      {list.length === 0 && jobs.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">暂无模型，开始训练来创建</div>
      )}
    </div>
  );
}
