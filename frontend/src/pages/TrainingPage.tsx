import { useState } from 'react';
import { Cpu } from 'lucide-react';

interface DatasetInfo {
  id: string; name: string; imageCount: number;
}
interface Props {
  datasets: DatasetInfo[];
  onStart: (c: { name: string; model: string; epochs: number; imgsz: number; batch: number; device: string; datasetId: string }) => void;
  onClose: () => void;
  training: boolean;
}

const MODELS = [
  { value: 'yolov8n.pt', label: 'YOLOv8 Nano', desc: '最快，适合实时检测' },
  { value: 'yolov8s.pt', label: 'YOLOv8 Small', desc: '平衡速度与精度' },
  { value: 'yolov8m.pt', label: 'YOLOv8 Medium', desc: '更高精度' },
  { value: 'yolov8l.pt', label: 'YOLOv8 Large', desc: '高精度，适合复杂场景' },
];

export default function TrainingPage({ datasets, onStart, training }: Props) {
  const [name, setName] = useState('');
  const [model, setModel] = useState('yolov8n.pt');
  const [epochs, setEpochs] = useState(50);
  const [imgsz, setImgsz] = useState(640);
  const [batch, setBatch] = useState(16);
  const [device, setDevice] = useState('');
  const [datasetId, setDatasetId] = useState(datasets[0]?.id || '');

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500';
  const lbl = 'text-xs text-gray-500 mb-1 block';

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg"><Cpu className="w-5 h-5 text-purple-600" /></div>
          <h1 className="text-xl font-bold text-gray-900">模型训练</h1>
        </div>

        <section>
          <h2 className="text-sm font-semibold text-gray-800 mb-4">基础配置</h2>
          <div className="space-y-4">
            <div>
              <label className={lbl}>训练名称</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="例如: my-first-train" className={inp} />
            </div>
            <div>
              <label className={lbl}>数据集</label>
              <select value={datasetId} onChange={e => setDatasetId(e.target.value)} className={inp}>
                {datasets.map(d => <option key={d.id} value={d.id}>{d.name} ({d.imageCount} 张图片)</option>)}
              </select>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-800 mb-4">模型选择</h2>
          <div className="grid grid-cols-2 gap-3">
            {MODELS.map(m => (
              <div key={m.value} onClick={() => setModel(m.value)}
                className={`p-4 border rounded-xl cursor-pointer transition-all ${model === m.value ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${model === m.value ? 'border-purple-600' : 'border-gray-300'}`}>
                    {model === m.value && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{m.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1.5 ml-6">{m.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-800 mb-4">超参数</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>训练轮次 (Epochs)</label>
              <input type="number" value={epochs} onChange={e => setEpochs(+e.target.value)} className={inp} />
              <p className="text-xs text-gray-400 mt-1">推荐 50-100</p>
            </div>
            <div>
              <label className={lbl}>图片尺寸 (Image Size)</label>
              <select value={imgsz} onChange={e => setImgsz(+e.target.value)} className={inp}>
                <option value={320}>320</option>
                <option value={640}>640</option>
                <option value={1280}>1280</option>
              </select>
            </div>
            <div>
              <label className={lbl}>批次大小 (Batch Size)</label>
              <input type="number" value={batch} onChange={e => setBatch(+e.target.value)} className={inp} />
              <p className="text-xs text-gray-400 mt-1">根据显存调整</p>
            </div>
            <div>
              <label className={lbl}>训练设备</label>
              <select value={device} onChange={e => setDevice(e.target.value)} className={inp}>
                <option value="">自动</option>
                <option value="cpu">CPU</option>
                <option value="0">GPU 0</option>
              </select>
            </div>
          </div>
        </section>

        <button onClick={() => onStart({ name, model, epochs, imgsz, batch, device, datasetId })} disabled={training || !datasetId}
          className="w-full py-3 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-gray-300 transition-colors">
          {training ? '启动中...' : '开始训练'}
        </button>
      </div>
    </div>
  );
}
