import { ChevronDown, Image, ToggleLeft, List, Grid3X3 } from 'lucide-react';

export const FilterBar = () => {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="text"
        placeholder="Filter by filename"
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none placeholder-gray-400 w-44"
      />
      <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors bg-white">
        <span>Split</span>
        <ChevronDown className="w-4 h-4" />
      </button>
      <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors bg-white">
        <span>Classes</span>
        <ChevronDown className="w-4 h-4" />
      </button>
      <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors bg-white">
        <span>Tags</span>
        <ChevronDown className="w-4 h-4" />
      </button>
      <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors bg-white">
        <span className="text-gray-500">Sort By</span>
        <span>Newest</span>
        <ChevronDown className="w-4 h-4" />
      </button>
      <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors bg-white">
        <Image className="w-4 h-4" />
        <span>Search by Image</span>
      </button>
      <div className="flex items-center gap-2 ml-1">
        <div className="relative inline-flex h-5 w-9 items-center rounded-full bg-purple-600">
          <span className="translate-x-5 inline-block h-3 w-3 transform rounded-full bg-white transition" />
        </div>
        <span className="text-sm text-gray-700">Show annotations</span>
      </div>
      <div className="flex items-center ml-auto border border-gray-300 rounded-lg overflow-hidden bg-white">
        <button className="p-2 hover:bg-gray-50 transition-colors text-gray-500">
          <List className="w-4 h-4" />
        </button>
        <button className="p-2 bg-purple-50 text-purple-600 border-l border-gray-300">
          <Grid3X3 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
