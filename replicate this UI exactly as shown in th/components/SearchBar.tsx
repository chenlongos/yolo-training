import { Search, Download } from 'lucide-react';

export const SearchBar = () => {
  return (
    <div className="flex gap-2">
      <div className="flex-1 flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white">
        <input
          type="text"
          placeholder="Search images"
          className="flex-1 px-4 py-2.5 text-sm outline-none placeholder-gray-400"
        />
        <button className="flex items-center gap-1.5 px-4 py-2.5 border-l border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          <Search className="w-4 h-4" />
          <span>Search</span>
        </button>
      </div>
      <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors bg-white">
        <Download className="w-4 h-4" />
        <span>Export</span>
      </button>
    </div>
  );
};
