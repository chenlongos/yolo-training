import type { Dataset } from '../types';

interface Props {
  datasets: Dataset[];
  onSelect: (id: string) => void;
  onNewDataset: () => void;
}

export default function DataPanel({ datasets, onSelect, onNewDataset }: Props) {
  return (
    <div className="w-full flex-1">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">数据集</h3>
        <button onClick={onNewDataset}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
          + 新建数据集
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {datasets.map(d => (
          <div key={d.id} onClick={() => onSelect(d.id)}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all">
            <h4 className="font-medium text-gray-800 text-sm">{d.name}</h4>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span>{d.image_count} 张图片</span>
              <span>v{d.current_version}</span>
            </div>
          </div>
        ))}
        {datasets.length === 0 && (
          <div className="col-span-full text-center py-16 text-gray-400 text-sm">暂无数据集</div>
        )}
      </div>
    </div>
  );
}
