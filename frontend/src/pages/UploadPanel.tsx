import { Upload, Info, Code, ImageIcon, FileText, Video, FilePlus, FolderOpen, Camera, Wifi } from 'lucide-react';

type SourceType = 'webcam' | 'file' | 'ipcam';

interface Props {
  sourceType: SourceType;
  carIp: string;
  camActive: boolean;
  uploadFiles: File[];
  uploadProgress: number;
  uploading: boolean;
  totalImages: number;
  onSourceType: (t: SourceType) => void;
  onCarIp: (u: string) => void;
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

const TABS: { key: SourceType; label: string; icon: React.ElementType }[] = [
  { key: 'file', label: '文件上传', icon: Upload },
  { key: 'webcam', label: '电脑摄像头', icon: Camera },
  { key: 'ipcam', label: '小车摄像头', icon: Wifi },
];

export default function UploadPanel(props: Props) {
  const pickFiles = (dir = false) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.jpg,.jpeg,.png,.bmp,.webp'; inp.multiple = true;
    if (dir) (inp as any).webkitdirectory = true;
    inp.onchange = e => { const files = (e.target as HTMLInputElement).files; if (files) props.onFileSelect(Array.from(files).slice(0, 500)); };
    inp.click();
  };

  return (
    <div className="w-full flex-1 -m-6 p-6 flex flex-col min-h-0">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 shrink-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => props.onSourceType(t.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-md flex items-center justify-center gap-2 cursor-pointer transition-colors ${props.sourceType === t.key ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* File upload mode */}
      {props.sourceType === 'file' && (
        <div className="flex-1 flex flex-col min-h-0 gap-4">
          <div className="flex-1 flex flex-col border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
              <div className="w-12 h-12 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">拖拽文件到此处上传</h2>
                <p className="text-xs text-gray-500 mt-0.5">或选择以下方式</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => pickFiles(false)} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 shadow-sm">
                  <FilePlus className="w-4 h-4" />选择文件
                </button>
                <button onClick={() => pickFiles(true)} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 shadow-sm">
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
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">{props.uploadFiles.length} 个文件</span>
                <button onClick={props.onClearFiles} className="text-xs text-gray-400 hover:text-red-500">清空</button>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-0.5 mb-3">
                {props.uploadFiles.map((f, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5 px-1 rounded hover:bg-gray-50">
                    <span className="text-gray-600 truncate flex-1 font-mono">{f.name}</span>
                    <span className="text-gray-400 ml-2 shrink-0">{(f.size / 1024 / 1024).toFixed(1)}M</span>
                  </div>
                ))}
              </div>
              {props.uploading && <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-3"><div className="h-full bg-violet-600 rounded-full" style={{ width: `${props.uploadProgress}%` }} /></div>}
              <button onClick={props.onUpload} disabled={props.uploading}
                className="w-full py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:bg-gray-300">
                {props.uploading ? `上传中 ${props.uploadProgress}%` : `上传 ${props.uploadFiles.length} 个文件`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Webcam mode */}
      {props.sourceType === 'webcam' && (
        <div className="flex-1 flex flex-col items-center gap-4 min-h-0">
          <div className="relative w-full max-w-2xl bg-black rounded-xl overflow-hidden flex-1 flex items-center justify-center min-h-0">
            {props.camActive ? (
              <video id="capture-video" autoPlay playsInline muted className="w-full h-full object-contain" />
            ) : (
              <div className="text-center text-gray-400 p-8">
                <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">点击下方按钮启动摄像头</p>
              </div>
            )}
          </div>
          <div className="flex gap-3 shrink-0">
            <button onClick={props.onToggleCamera}
              className={`px-6 py-2.5 text-sm font-medium rounded-lg ${props.camActive ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
              {props.camActive ? '关闭摄像头' : '启动摄像头'}
            </button>
            {props.camActive && (
              <button onClick={props.onCapture}
                className="px-6 py-2.5 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700">
                拍摄图片
              </button>
            )}
            <p className="text-xs text-gray-500 text-center">数据集已有 {props.totalImages} 张图片</p>
          </div>
        </div>
      )}

      {/* IP Camera mode */}
      {props.sourceType === 'ipcam' && (
        <div className="flex-1 flex flex-col items-center gap-4 min-h-0">
          {/* Stream preview */}
          <div className="relative w-full max-w-2xl bg-black rounded-xl overflow-hidden flex-1 flex items-center justify-center min-h-0">
            {props.camActive ? (
              <img
                key={props.carIp}
                src={`http://${props.carIp}/api/camera/stream?fps=30`}
                alt="car camera"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center text-gray-400 p-8">
                <Wifi className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">输入 IP 后点击连接</p>
              </div>
            )}
          </div>
          <div className="w-full max-w-2xl space-y-3 shrink-0">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">小车 IP 地址</label>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                <span className="text-sm text-gray-400 font-mono shrink-0">http://</span>
                <input value={props.carIp} onChange={e => props.onCarIp(e.target.value)}
                  placeholder="127.0.0.1"
                  className="flex-1 bg-transparent text-sm outline-none font-mono min-w-0" />
                <span className="text-sm text-gray-400 font-mono shrink-0">/api/camera/stream?fps=30</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={props.onToggleCamera}
                className={`flex-1 py-3 text-sm font-medium rounded-lg ${props.camActive ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
                {props.camActive ? '断开连接' : '连接摄像头'}
              </button>
              {props.camActive && (
                <button onClick={props.onCapture}
                  className="flex-1 py-3 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
                  拍摄图片
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 text-center">数据集已有 {props.totalImages} 张图片</p>
          </div>
        </div>
      )}
    </div>
  );
}
