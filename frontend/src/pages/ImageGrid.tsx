import { useState } from 'react';
import type { Image, Dataset, LabelClass } from '../types';
import ImageCard from '../components/ImageCard';
import FilterBar from '../components/FilterBar';
import Pagination from '../components/Pagination';

const PER_PAGE = 54;

interface Props {
  dataset: Dataset;
  images: Image[];
  classes: LabelClass[];
  page: number;
  total: number;
  onPage: (p: number) => void;
  onSearch: (q: string) => void;
  onAnnotate: (datasetId: string) => void;
  onTrain: () => void;
  onImageClick: (index: number) => void;
  onDeleteImages: (ids: string[]) => void;
}

function imgStatus(s: string): 'checked' | 'person' | 'edit' {
  if (s === 'annotated') return 'checked';
  if (s === 'reviewed') return 'person';
  return 'edit';
}

export default function ImageGrid({ dataset, images, classes, page, total, onPage, onSearch, onAnnotate, onTrain, onImageClick, onDeleteImages }: Props) {
  const [filterText, setFilterText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!dataset) {
    return <div className="w-full flex-1 flex items-center justify-center text-gray-400 text-sm">数据集未找到</div>;
  }

  const filtered = filterText
    ? (images || []).filter(i => i.filename.toLowerCase().includes(filterText.toLowerCase()))
    : (images || []);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === filtered.length) { setSelected(new Set()); return; }
    setSelected(new Set(filtered.map(i => i.id)));
  }

  function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`删除 ${selected.size} 张图片？`)) return;
    onDeleteImages(Array.from(selected));
    setSelected(new Set());
  }

  return (
    <div className="w-full flex-1 flex flex-col min-h-0">
      {/* Header + Actions */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-800">{dataset.name}</h3>
          <span className="text-xs text-gray-500">{total} 张</span>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={deleteSelected}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100">
              删除 {selected.size} 张
            </button>
          )}
          <button onClick={selectAll} className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
            {selected.size === filtered.length && filtered.length > 0 ? '取消全选' : '全选'}
          </button>
          <button onClick={() => onAnnotate(dataset.id)} className="px-4 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700 font-medium">标注</button>
          <button onClick={onTrain} className="px-4 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium">训练</button>
          <a href={`/api/v1/datasets/${dataset.id}/export/yolo`} onClick={e => e.stopPropagation()}
            className="px-4 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium no-underline">导出 YOLO</a>
        </div>
      </div>

      {/* 筛选栏 */}
      <FilterBar
        filterText={filterText}
        onFilterChange={setFilterText}
        classes={classes}
        totalAnnotated={images.filter(i => i.status === 'annotated').length}
        totalImages={total}
      />

      {/* 图片网格 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 py-3 flex-1 overflow-y-auto">
        {filtered.map((img, i) => (
          <div key={img.id} className="relative group">
            <div className="absolute top-1 left-1 z-10">
              <input
                type="checkbox" checked={selected.has(img.id)} onChange={() => toggleSelect(img.id)}
                className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              />
            </div>
            <div className={selected.has(img.id) ? 'ring-2 ring-violet-500 rounded-lg' : ''}>
              <ImageCard
                filename={img.filename}
                imageUrl={img.thumbnail_url || img.image_url || `/api/v1/images/${img.id}/thumbnail`}
                status={imgStatus(img.status)}
                hasAnnotation={img.status === 'annotated'}
                onClick={() => onImageClick(i)}
              />
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-gray-400 text-sm">
            {filterText ? '无匹配图片' : '暂无图片'}
          </div>
        )}
      </div>

      {/* 分页 */}
      <Pagination page={page} perPage={PER_PAGE} total={total} onPageChange={onPage} />
    </div>
  );
}
