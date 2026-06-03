import { Check, PersonStanding, Pencil } from 'lucide-react';

interface Props {
  filename: string;
  imageUrl: string;
  status: 'checked' | 'person' | 'edit';
  hasAnnotation?: boolean;
}

const statusIcons = {
  checked: <Check className="w-3 h-3 text-white" />,
  person: <PersonStanding className="w-3 h-3 text-white" />,
  edit: <Pencil className="w-3 h-3 text-white" />,
};

const statusColors = {
  checked: 'bg-sky-500',
  person: 'bg-purple-500',
  edit: 'bg-orange-400',
};

export default function ImageCard({ filename, imageUrl, status, hasAnnotation }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
        <img src={imageUrl} alt={filename} className="w-full h-full object-cover"
          onError={e => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23e5e7eb" width="100" height="100"/></svg>'; }} />
        {hasAnnotation && <div className="absolute inset-0 border-2 border-yellow-400 rounded-lg pointer-events-none" />}
        <div className={`absolute bottom-2 left-2 w-5 h-5 rounded-md ${statusColors[status]} flex items-center justify-center`}>
          {statusIcons[status]}
        </div>
      </div>
      <span className="text-xs text-gray-500 truncate">{filename}</span>
    </div>
  );
}
