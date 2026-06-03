import { Images, HelpCircle, Zap, ChevronDown } from 'lucide-react';

export const Header = () => {
  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-gray-200">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Images className="w-6 h-6 text-gray-800" />
          <h1 className="text-xl font-bold text-gray-900">Dataset</h1>
        </div>
        <button className="flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-700 transition-colors">
          <HelpCircle className="w-4 h-4" />
          <span>How to Search</span>
        </button>
      </div>
      <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
        <Zap className="w-4 h-4" />
        <span>Train Model</span>
        <ChevronDown className="w-4 h-4" />
      </button>
    </header>
  );
};
