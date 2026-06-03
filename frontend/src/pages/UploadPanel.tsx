import { Upload, Info, Search, Code, ImageIcon, FileText, Video, FilePlus, FolderOpen } from 'lucide-react';

type SourceType = 'webcam' | 'file' | 'ipcam';

interface Props {
  sourceType: SourceType;
  ipUrl: string;
  camActive: boolean;
  uploadFiles: File[];
  uploadProgress: number;
  uploading: boolean;
  captureCount: number;
  onSourceType: (t: SourceType) => void;
  onIpUrl: (u: string) => void;
  onToggleCamera: () => void;
  onCapture: () => void;
  onFileSelect: (files: File[]) => void;
  onUpload: () => void;
  onClearFiles: () => void;
}

const FormatItem = ({ icon: Icon, title, formats }: { icon: React.ElementType; title: string; formats: React.ReactNode }) => (
  <div className="flex items-center gap-2">
    <Icon className="w-3.5 h-3.5 text-gray-400" />
    <span className="text-xs text-gray-600">{title}</span>
    <span className="text-xs text-gray-400">{formats}</span>
  </div>
);

export default function UploadPanel(props: Props) {
  const pickFiles = (dir = false) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.jpg,.jpeg,.png,.bmp,.webp'; inp.multiple = true;
    if (dir) (inp as any).webkitdirectory = true;
    inp.onchange = e => { const files = (e.target as HTMLInputElement).files; if (files) props.onFileSelect(Array.from(files).slice(0, 500)); };
    inp.click();
  };

  return (
    <div className="w-full flex-1 -m-6 p-4 flex flex-col min-h-0">
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Left - Dropzone */}
        <div className="flex-1 flex flex-col min-h-0 gap-3">
          <div className="flex-1 flex flex-col border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
              <div className="w-10 h-10 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">拖拽文件到此处上传</h2>
                <p className="text-xs text-gray-500 mt-0.5">或选择以下方式</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => pickFiles(false)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 shadow-sm">
                  <FilePlus className="w-4 h-4" />选择文件
                </button>
                <button onClick={() => pickFiles(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 shadow-sm">
                  <FolderOpen className="w-4 h-4" />选择文件夹
                </button>
              </div>

              <div className="w-full max-w-xl mt-2">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">支持格式</div>
                <div className="bg-white border border-gray-200 rounded-lg p-2.5">
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    <FormatItem icon={ImageIcon} title="图片" formats=".jpg .png .bmp .webp" />
                    <FormatItem icon={Info} title="标注" formats={<span className="text-violet-600 text-xs">YOLO</span>} />
                    <FormatItem icon={Video} title="视频" formats=".mov .mp4" />
                    <FormatItem icon={FileText} title="PDF" formats=".pdf" />
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-[9px] text-gray-400">*最大 20MB</div>
                </div>
              </div>
            </div>
          </div>

          {props.uploadFiles.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{props.uploadFiles.length} 个文件</span>
                <button onClick={props.onClearFiles} className="text-xs text-gray-400 hover:text-red-500">清空</button>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-0.5 mb-2">
                {props.uploadFiles.map((f, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5 px-1 rounded hover:bg-gray-50">
                    <span className="text-gray-600 truncate flex-1 font-mono">{f.name}</span>
                    <span className="text-gray-400 ml-2 shrink-0">{(f.size / 1024 / 1024).toFixed(1)}M</span>
                  </div>
                ))}
              </div>
              {props.uploading && <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2"><div className="h-full bg-violet-600 rounded-full" style={{ width: `${props.uploadProgress}%` }} /></div>}
              <button onClick={props.onUpload} disabled={props.uploading}
                className="w-full py-1.5 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:bg-gray-300">
                {props.uploading ? `上传中 ${props.uploadProgress}%` : `上传 ${props.uploadFiles.length} 个文件`}
              </button>
            </div>
          )}
        </div>

        {/* Right - Camera & Search */}
        <div className="lg:w-56 flex flex-col gap-3 shrink-0">
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Code className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-800">摄像头采集</h3>
            </div>
            <div className="space-y-1.5">
              <select value={props.sourceType} onChange={e => props.onSourceType(e.target.value as SourceType)}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-violet-500">
                <option value="webcam">电脑摄像头</option>
                <option value="ipcam">小车摄像头</option>
              </select>
              {props.sourceType === 'ipcam' && (
                <input value={props.ipUrl} onChange={e => props.onIpUrl(e.target.value)} placeholder="摄像头地址"
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 font-mono" />
              )}
              <button onClick={props.onToggleCamera}
                className={`w-full py-1.5 text-xs font-medium rounded-lg ${props.camActive ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
                {props.camActive ? '停止' : '启动'}
              </button>
              {props.camActive && (
                <>
                  <video id="capture-video" autoPlay playsInline muted className="w-full rounded bg-black" style={{ maxHeight: 80 }} />
                  <button onClick={props.onCapture}
                    className="w-full py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700">
                    拍摄图片{props.captureCount > 0 ? ` (${props.captureCount})` : ''}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-800">数据集广场</h3>
            </div>
            <div className="flex gap-1">
              <input type="text" placeholder="搜索数据集..." className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-l-lg outline-none focus:ring-1 focus:ring-violet-500" />
              <button className="px-3 bg-violet-600 text-white rounded-r-lg hover:bg-violet-700"><Search className="w-3 h-3" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
