import { Trash2 } from 'lucide-react';
import type { TrainedModel } from '../types';
import { models as modelApi } from '../api/endpoints';

interface Props {
  model: TrainedModel;
  onDelete?: (id: string, name: string) => void;
}

export default function ModelDetail({ model: m, onDelete }: Props) {
  return (
    <div className="w-full flex-1 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{m.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{m.status}</span>
        </div>
        <div className="flex items-center gap-2">
          {m.weights_path && (
            <a href={modelApi.downloadUrl(m.id, 'pt')}
              className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-medium">下载模型</a>
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
    </div>
  );
}
