import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

export const Pagination = () => {
  return (
    <div className="flex items-center justify-between py-4 border-t border-gray-200">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Images per page:</span>
        <button className="flex items-center gap-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors bg-white">
          <span>50</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button className="p-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors bg-white">
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <span className="text-sm text-gray-700">1 - 50 of 968</span>
        <button className="p-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors bg-white">
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>
    </div>
  );
};
