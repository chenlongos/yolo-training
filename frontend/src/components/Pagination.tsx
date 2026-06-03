import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

interface Props {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (p: number) => void;
}

export default function Pagination({ page, perPage, total, onPageChange }: Props) {
  const totalPages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  return (
    <div className="flex items-center justify-between py-3 border-t border-gray-200 mt-auto shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600">每页:</span>
        <button className="flex items-center gap-1 px-2 py-1 border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50 bg-white">
          <span>{perPage}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}
          className="p-1.5 border border-gray-300 rounded hover:bg-gray-50 bg-white disabled:opacity-30">
          <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <span className="text-gray-700">{start} - {end} / {total}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className="p-1.5 border border-gray-300 rounded hover:bg-gray-50 bg-white disabled:opacity-30">
          <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
        </button>
      </div>
    </div>
  );
}
