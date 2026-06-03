import type { TrainedModel } from '../types';
import { models as modelApi } from '../api/endpoints';

interface Props {
  models: TrainedModel[];
  onSelect: (id: string) => void;
}

export default function ModelPanel({ models: list, onSelect }: Props) {
  return (
    <div className="w-full flex-1">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">模型</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {list.map(m => (
          <div key={m.id} onClick={() => onSelect(m.id)}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 cursor-pointer hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-800 text-sm">{m.name}</h4>
              <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{m.status}</span>
            </div>
            {m.metrics && (
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(m.metrics).slice(0, 3).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded p-2 text-center">
                    <div className="text-[10px] text-gray-500">{k}</div>
                    <div className="text-xs font-bold text-violet-600 font-mono">{typeof v === 'number' ? v.toFixed(3) : v}</div>
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
    </div>
  );
}
