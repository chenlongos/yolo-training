import { useState, useEffect } from 'react';
import { Rocket, Download, Loader2, CheckCircle2, Box, FileDown } from 'lucide-react';
import { models as modelApi } from '../api/endpoints';
import type { TrainedModel } from '../types';

interface Props {
  models: TrainedModel[];
}

const FORMATS = [
  { value: 'onnx', label: 'ONNX (FP32)', desc: '全精度，跨平台推理', key: 'onnx_path' as const },
  { value: 'fp16_onnx', label: 'ONNX (FP16)', desc: '半精度，体积减半，速度更快', key: 'fp16_onnx_path' as const },
  { value: 'int8_onnx', label: 'ONNX (INT8)', desc: '8-bit 量化，最小体积，最快速度', key: 'int8_onnx_path' as const, requires: 'onnx_path' as const },
];

export default function DeployPanel({ models }: Props) {
  const [selectedModel, setSelectedModel] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [modelDetail, setModelDetail] = useState<TrainedModel | null>(null);
  const [quantMethod, setQuantMethod] = useState('dynamic');

  const completedModels = models.filter(m => m.status === 'completed' && m.weights_path);
  const model = completedModels.find(m => m.id === selectedModel);

  // Refresh model detail when selection changes or after export
  useEffect(() => {
    if (!selectedModel) { setModelDetail(null); return; }
    fetch(`/api/v1/models/${selectedModel}`).then(r => r.json()).then(setModelDetail).catch(() => {});
  }, [selectedModel]);

  async function handleExport(format: string) {
    if (!selectedModel) return;
    setExporting(true);
    setError('');
    try {
      const params = new URLSearchParams({ format });
      if (format === 'int8_onnx') params.append('method', quantMethod);
      await fetch(`/api/v1/models/${selectedModel}/export?${params}`, { method: 'POST' });
      // Refresh model to get updated format list
      const resp = await fetch(`/api/v1/models/${selectedModel}`);
      const updated = await resp.json();
      setModelDetail(updated);
    } catch (e: any) {
      setError(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500';
  const lbl = 'text-xs text-gray-500 mb-1 block';

  return (
    <div className="w-full flex-1 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-100 rounded-lg"><Rocket className="w-5 h-5 text-violet-600" /></div>
        <h3 className="text-sm font-semibold text-gray-800">模型部署</h3>
      </div>

      {/* Model selector */}
      <div>
        <label className={lbl}>选择模型</label>
        <select value={selectedModel} onChange={e => { setSelectedModel(e.target.value); setExportResult(null); setError(''); }} className={inp}>
          <option value="">-- 选择已训练模型 --</option>
          {completedModels.map(m => (
            <option key={m.id} value={m.id}>{m.name}{m.metrics ? ` (mAP50: ${typeof m.metrics.mAP50 === 'number' ? m.metrics.mAP50.toFixed(3) : '-'})` : ''}</option>
          ))}
        </select>
      </div>

      {/* Model info */}
      {model && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Box size={14} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">{model.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">completed</span>
          </div>
          {model.metrics && (
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(model.metrics).slice(0, 3).map(([k, v]) => (
                <div key={k} className="text-center">
                  <div className="text-[10px] text-gray-500">{k}</div>
                  <div className="text-xs font-bold text-violet-600 font-mono">{typeof v === 'number' ? v.toFixed(3) : v}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Model assets */}
      {modelDetail && (
        <div>
          <label className={lbl}>模型资产</label>
          <div className="space-y-2">
            {/* Always show PT weights */}
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
              <div>
                <div className="text-sm font-medium text-gray-800">PyTorch 权重</div>
                <div className="text-xs text-gray-500">原始训练权重，可继续训练</div>
              </div>
              <a href={modelApi.downloadUrl(modelDetail.id, 'pt')}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 no-underline cursor-pointer flex items-center gap-2">
                <Download size={14} /> 下载
              </a>
            </div>

            {/* Exportable formats */}
            {FORMATS.map(f => {
              const hasFormat = !!(modelDetail as any)[f.key];
              const prereq = f.requires ? !!(modelDetail as any)[f.requires] : true;
              const disabled = !prereq && !hasFormat;
              const isInt8 = f.value === 'int8_onnx';
              return (
                <div key={f.value}
                  className={`rounded-lg p-4 border ${hasFormat ? 'bg-emerald-50 border-emerald-200' : disabled ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{f.label}</span>
                        {hasFormat && <CheckCircle2 size={14} className="text-emerald-500" />}
                      </div>
                      <div className="text-xs text-gray-500">{disabled ? '需先导出 ONNX' : f.desc}</div>
                    </div>
                    {hasFormat ? (
                      <a href={modelApi.downloadUrl(modelDetail.id, f.value)}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 no-underline cursor-pointer flex items-center gap-2 shrink-0">
                        <FileDown size={14} /> 下载
                      </a>
                    ) : (
                      <button onClick={() => handleExport(f.value)} disabled={exporting || disabled}
                        className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:bg-gray-300 transition-colors cursor-pointer flex items-center gap-2 shrink-0">
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket size={14} />}
                        导出
                      </button>
                    )}
                  </div>
                  {/* Quantization options for INT8 */}
                  {isInt8 && !hasFormat && !disabled && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <label className="text-xs text-gray-500 mb-1.5 block">量化方式</label>
                      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                        {[
                          ['dynamic', '动态量化', '快速，无需校准数据'],
                          ['static', '静态量化', '更精准，需校准图像'],
                        ].map(([val, label, desc]) => (
                          <button key={val} onClick={() => setQuantMethod(val)}
                            className={`flex-1 py-1.5 px-2 text-xs rounded-md cursor-pointer transition-colors ${quantMethod === val ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            title={desc}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <div className="text-xs text-red-500 bg-red-50 rounded-lg p-3">{error}</div>}

      {completedModels.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">暂无已完成训练的模型可部署</div>
      )}
    </div>
  );
}
