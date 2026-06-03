import { Check, Tag, RefreshCw, Ban, FolderOpen, Trash2 } from 'lucide-react';

export const ActionBar = () => {
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-white border border-purple-200 rounded-xl shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
        <Check className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-600">0 images selected</span>
      </div>
      <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        <Tag className="w-4 h-4" />
        <span>Add Tags & Metadata</span>
      </button>
      <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        <RefreshCw className="w-4 h-4" />
        <span>Reassign For Labeling</span>
      </button>
      <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        <Ban className="w-4 h-4" />
        <span>Mark Null</span>
      </button>
      <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        <FolderOpen className="w-4 h-4" />
        <span>Change Dataset Split</span>
      </button>
      <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        <Trash2 className="w-4 h-4" />
        <span>Delete Image</span>
      </button>
    </div>
  );
};
