import type { Image, Dataset, LabelClass } from '../types';

const PER_PAGE = 54;

interface Props {
  dataset: Dataset;
  images: Image[];
  classes: LabelClass[];
  page: number;
  total: number;
  onPage: (p: number) => void;
  onAnnotate: (datasetId: string) => void;
  onTrain: () => void;
  onImageClick: (index: number) => void;
}

export default function ImageGrid({ dataset, images, classes, page, total, onPage, onAnnotate, onTrain, onImageClick }: Props) {
  const annotated = images.filter(i => i.status === 'annotated').length;

  return (
    <div className="w-full flex-1 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{dataset.name}</h3>
          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
            <span>{total} 张图片</span>
            <span className="text-emerald-600">{annotated} 已标注</span>
            <span>{classes.length} 类别</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onAnnotate(dataset.id)} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-medium">标注</button>
          <button onClick={onTrain} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 font-medium">训练</button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {images.map((img, i) => (
          <div key={img.id} onClick={() => onImageClick(i)}
            className="group relative aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-emerald-400 transition-all">
            <img src={img.thumbnail_url || img.image_url || `/api/v1/images/${img.id}/thumbnail`}
              alt={img.filename} loading="lazy" className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23e5e7eb" width="100" height="100"/></svg>'; }} />
            {img.status === 'annotated' && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-[9px] text-white truncate">{img.filename}</p>
            </div>
          </div>
        ))}
      </div>

      {total > PER_PAGE && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300">上一页</button>
          <span className="text-sm text-gray-500">{page} / {Math.ceil(total / PER_PAGE)}</span>
          <button onClick={() => onPage(page + 1)} disabled={page * PER_PAGE >= total}
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300">下一页</button>
        </div>
      )}

      {images.length === 0 && <p className="text-gray-400 text-sm text-center py-12">暂无图片</p>}
    </div>
  );
}
