import { useState, useEffect, useRef } from 'react';
import { Cpu, X } from 'lucide-react';

interface Props {
  onStart: (c: { name: string; model: string; epochs: number; imgsz: number; batch: number; device: string; datasetId?: string }) => Promise<any>;
  onClose: () => void;
  training: boolean;
}

const MODELS = [
  { value: 'yolov8n.pt', label: 'YOLOv8 Nano', desc: '最快，适合实时检测' },
  { value: 'yolov8s.pt', label: 'YOLOv8 Small', desc: '平衡速度与精度' },
  { value: 'yolov8m.pt', label: 'YOLOv8 Medium', desc: '更高精度' },
];

export default function TrainingPage({ onStart, onClose }: Props) {
  const [name, setName] = useState(`train_${new Date().toISOString().slice(0, 10)}`);
  const [model, setModel] = useState('yolov8n.pt');
  const [epochs, setEpochs] = useState(50);
  const [imgsz, setImgsz] = useState(640);
  const [batch, setBatch] = useState(16);
  const [device, setDevice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 训练监控状态
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [currentEpoch, setCurrentEpoch] = useState(0);
  const [totalEpochs, setTotalEpochs] = useState(50);
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    if (!jobId) return;
    async function poll() {
      try {
        const resp = await fetch(`/api/v1/training/jobs/${jobId}`);
        const job = await resp.json();
        setJobStatus(job.status);
        setProgress(job.progress || 0);
        setCurrentEpoch(job.current_epoch || 0);
        if (job.total_epochs) setTotalEpochs(job.total_epochs);
        if (job.current_metric) setMetrics(job.current_metric);
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return;
      } catch {}
      timerRef.current = window.setTimeout(poll, 3000);
    }
    poll();
    return () => clearTimeout(timerRef.current);
  }, [jobId]);

  async function handleStart() {
    setLoading(true); setError('');
    try {
      const result = await onStart({ name, model, epochs, imgsz, batch, device, datasetId: '' });
      setTotalEpochs(epochs);
      setJobId(result?.id || 'unknown');
      setJobStatus('queued');
    } catch (e: any) { setError(e.message || '启动失败'); }
    finally { setLoading(false); }
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500';
  const lbl = 'text-xs text-gray-500 mb-1 block';

  // 训练监控视图
  if (jobId) {
    const statusText: Record<string, string> = { queued: '排队中', running: '训练中', completed: '已完成', failed: '失败', cancelled: '已取消' };
    const statusColor: Record<string, string> = { queued: 'text-amber-500', running: 'text-cyan-500', completed: 'text-emerald-500', failed: 'text-red-500', cancelled: 'text-gray-500' };

    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg"><Cpu className="w-5 h-5 text-purple-600" /></div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">训练监控</h1>
                <p className="text-xs text-gray-500">{name} · {model}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer" title="关闭">
              <X size={18} />
            </button>
          </div>

          {/* 状态 */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${jobStatus === 'running' ? 'bg-cyan-400 animate-pulse' : jobStatus === 'completed' ? 'bg-emerald-400' : jobStatus === 'failed' ? 'bg-red-400' : 'bg-amber-400'}`} />
            <span className={`text-sm font-medium ${statusColor[jobStatus] || 'text-gray-500'}`}>{statusText[jobStatus] || jobStatus}</span>
          </div>

          {/* 进度条 */}
          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-gray-500">进度</span>
              <span className="text-gray-600 font-mono">{progress.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${jobStatus === 'completed' ? 'bg-emerald-500' : jobStatus === 'failed' ? 'bg-red-500' : 'bg-purple-500'}`}
                style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1.5 font-mono">Epoch {currentEpoch} / {totalEpochs}</p>
          </div>

          {/* 实时指标 */}
          {metrics && (
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(metrics).slice(0, 3).map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500 truncate">{k}</div>
                  <div className="text-sm font-bold text-purple-600 font-mono mt-1">{typeof v === 'number' ? v.toFixed(3) : v}</div>
                </div>
              ))}
            </div>
          )}

          {jobStatus === 'completed' && <div className="text-sm text-emerald-600 text-center font-medium">训练完成！</div>}
          {jobStatus === 'failed' && <div className="text-sm text-red-500 text-center">训练失败，请查看日志</div>}
        </div>
      </div>
    );
  }

  // 配置表单
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><Cpu className="w-5 h-5 text-purple-600" /></div>
            <h1 className="text-xl font-bold text-gray-900">模型训练</h1>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer" title="关闭">
            <X size={18} />
          </button>
        </div>

        <section>
          <h2 className="text-sm font-semibold text-gray-800 mb-4">基础配置</h2>
          <div className="space-y-4">
            <div>
              <label className={lbl}>训练名称</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="自动生成或自定义" className={inp} />
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
              <label className={lbl}>训练轮次</label>
              <input type="number" value={epochs} onChange={e => setEpochs(+e.target.value)} className={inp} />
              <p className="text-xs text-gray-400 mt-1">推荐 50-100</p>
            </div>
            <div>
              <label className={lbl}>图片尺寸</label>
              <select value={imgsz} onChange={e => setImgsz(+e.target.value)} className={inp}>
                <option value={320}>320</option><option value={640}>640</option><option value={1280}>1280</option>
              </select>
            </div>
            <div>
              <label className={lbl}>批次大小</label>
              <input type="number" value={batch} onChange={e => setBatch(+e.target.value)} className={inp} />
              <p className="text-xs text-gray-400 mt-1">根据显存调整</p>
            </div>
            <div>
              <label className={lbl}>训练设备</label>
              <select value={device} onChange={e => setDevice(e.target.value)} className={inp}>
                <option value="">自动</option><option value="cpu">CPU</option><option value="0">GPU 0</option>
              </select>
            </div>
          </div>
        </section>

        {error && <div className="text-xs text-red-500 bg-red-50 rounded-lg p-3">{error}</div>}
        <button onClick={handleStart} disabled={loading}
          className="w-full py-3 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-gray-300 transition-colors">
          {loading ? '启动中...' : '开始训练'}
        </button>
      </div>
    </div>
  );
}
