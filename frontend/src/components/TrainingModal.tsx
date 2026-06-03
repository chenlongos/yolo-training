import { useState } from 'react';

interface Props {
  datasets: { id: string; name: string }[];
  onStart: (config: { name: string; model: string; epochs: number; imgsz: number; batch: number; device: string; datasetId: string }) => void;
  onClose: () => void;
}

export default function TrainingModal({ datasets, onStart, onClose }: Props) {
  const [name, setName] = useState('');
  const [model, setModel] = useState('yolov8n.pt');
  const [epochs, setEpochs] = useState(50);
  const [imgsz, setImgsz] = useState(640);
  const [batch, setBatch] = useState(16);
  const [device, setDevice] = useState('');
  const [datasetId, setDatasetId] = useState(datasets[0]?.id || '');

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">模型训练</h3>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="训练名称" className={input} />
          <select value={datasetId} onChange={e => setDatasetId(e.target.value)} className={input}>
            {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={model} onChange={e => setModel(e.target.value)} className={input}>
            <option value="yolov8n.pt">YOLOv8 Nano</option>
            <option value="yolov8s.pt">YOLOv8 Small</option>
            <option value="yolov8m.pt">YOLOv8 Medium</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 block mb-1">轮次</label><input type="number" value={epochs} onChange={e => setEpochs(+e.target.value)} className={input} /></div>
            <div><label className="text-xs text-gray-500 block mb-1">尺寸</label><input type="number" value={imgsz} onChange={e => setImgsz(+e.target.value)} className={input} /></div>
            <div><label className="text-xs text-gray-500 block mb-1">批次</label><input type="number" value={batch} onChange={e => setBatch(+e.target.value)} className={input} /></div>
            <div><label className="text-xs text-gray-500 block mb-1">设备</label><select value={device} onChange={e => setDevice(e.target.value)} className={input}><option value="">自动</option><option value="cpu">CPU</option><option value="0">GPU</option></select></div>
          </div>
          <button onClick={() => onStart({ name, model, epochs, imgsz, batch, device, datasetId })}
            className="w-full py-2.5 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700">
            开始训练
          </button>
        </div>
      </div>
    </div>
  );
}
