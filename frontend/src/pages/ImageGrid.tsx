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
}

function imgStatus(s: string): 'checked' | 'person' | 'edit' {
  if (s === 'annotated') return 'checked';
  if (s === 'reviewed') return 'person';
  return 'edit';
}

export default function ImageGrid({ dataset, images, classes, page, total, onPage, onSearch, onAnnotate, onTrain, onImageClick }: Props) {
  const [filterText, setFilterText] = useState('');

  const filtered = filterText
    ? images.filter(i => i.filename.toLowerCase().includes(filterText.toLowerCase()))
    : images;

  return (
    <div className="w-full flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-800">{dataset.name}</h3>
          <span className="text-xs text-gray-500">{total} 张图片</span>
          <span className="text-xs text-emerald-600">{images.filter(i => i.status === 'annotated').length} 已标注</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onAnnotate(dataset.id)} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 font-medium">标注</button>
          <button onClick={onTrain} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium">训练</button>
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
          <div key={img.id} onClick={() => onImageClick(i)} className="cursor-pointer">
            <ImageCard
              filename={img.filename}
              imageUrl={img.thumbnail_url || img.image_url || `/api/v1/images/${img.id}/thumbnail`}
              status={imgStatus(img.status)}
              hasAnnotation={img.status === 'annotated'}
            />
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-gray-400 text-sm">
            {filterText ? '无匹配图片' : '暂无图片'}
          </div>
        )}
      </div>

      {/* 分页 */}
      <Pagination
        page={page}
        perPage={PER_PAGE}
        total={total}
        onPageChange={onPage}
      />
    </div>
  );
}
