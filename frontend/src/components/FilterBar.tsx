import { ChevronDown, List, Grid3X3 } from 'lucide-react';
import type { LabelClass } from '../types';

interface Props {
  filterText: string;
  onFilterChange: (v: string) => void;
  classes: LabelClass[];
  totalAnnotated: number;
  totalImages: number;
}

export default function FilterBar({ filterText, onFilterChange, classes, totalAnnotated, totalImages }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <input
        type="text" value={filterText} onChange={e => onFilterChange(e.target.value)}
        placeholder="按文件名筛选"
        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm outline-none placeholder-gray-400 w-40"
      />
      <button className="flex items-center gap-1.5 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 bg-white">
        <span>Split</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      <button className="flex items-center gap-1.5 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 bg-white">
        <span>Classes ({classes.length})</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      <button className="flex items-center gap-1.5 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 bg-white">
        <span className="text-gray-500">排序</span>
        <span>最新</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      <span className="text-xs text-gray-500 ml-2">
        {totalAnnotated}/{totalImages} 已标注
      </span>
      <div className="flex items-center ml-auto border border-gray-300 rounded-lg overflow-hidden bg-white">
        <button className="p-1.5 hover:bg-gray-50 text-gray-500"><List className="w-3.5 h-3.5" /></button>
        <button className="p-1.5 bg-purple-50 text-purple-600 border-l border-gray-300"><Grid3X3 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}
