import { useState } from 'react';
import { Rocket, Download, CheckCircle2, Box, Container, Loader2, Copy, Check } from 'lucide-react';
import { models as modelApi } from '../api/endpoints';
import type { TrainedModel } from '../types';

interface Props {
  models: TrainedModel[];
}

const FORMAT_DEFS: Record<string, { label: string; color: string; desc: string }> = {
  pt: { label: 'PyTorch', color: 'bg-gray-100 text-gray-700', desc: '原始训练权重，可继续训练或导出' },
  onnx: { label: 'ONNX (FP32)', color: 'bg-amber-100 text-amber-700', desc: '全精度推理，跨平台部署' },
  fp16_onnx: { label: 'ONNX (FP16)', color: 'bg-yellow-100 text-yellow-700', desc: '半精度，体积减半速度更快' },
  int8_onnx: { label: 'ONNX (INT8)', color: 'bg-orange-100 text-orange-700', desc: '8-bit 量化，最小体积最快速度' },
};

function getFormats(m: TrainedModel): string[] {
  const fmts: string[] = [];
  if (m.weights_path) fmts.push('pt');
  if (m.onnx_path) fmts.push('onnx');
  if (m.fp16_onnx_path) fmts.push('fp16_onnx');
  if (m.int8_onnx_path) fmts.push('int8_onnx');
  return fmts;
}

export default function DeployPanel({ models }: Props) {
  const [selectedModel, setSelectedModel] = useState('');
  const [deployInfo, setDeployInfo] = useState<any>(null);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployError, setDeployError] = useState('');
  const [copiedFile, setCopiedFile] = useState('');

  const allModels = models.filter(m => m.status === 'completed');
  const model = allModels.find(m => m.id === selectedModel);

  const formats = model ? getFormats(model) : [];

  async function generateDeploy() {
    if (!selectedModel) return;
    setDeployLoading(true);
    setDeployError('');
    try {
      const resp = await fetch(`/api/v1/models/${selectedModel}/deploy`);
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || 'Failed');
      setDeployInfo(await resp.json());
    } catch (e: any) {
      setDeployError(e.message);
    } finally {
      setDeployLoading(false);
    }
  }

  async function copyToClipboard(text: string, filename: string) {
    await navigator.clipboard.writeText(text);
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile(''), 2000);
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500';

  return (
    <div className="w-full flex-1 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-100 rounded-lg"><Rocket className="w-5 h-5 text-violet-600" /></div>
        <h3 className="text-sm font-semibold text-gray-800">模型部署</h3>
      </div>
      <p className="text-xs text-gray-500">选择模型查看可部署的格式资产。模型转换请前往"模型"页面操作。</p>

      <div>
        <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className={inp}>
          <option value="">-- 选择模型 --</option>
          {allModels.filter(m => !m.parent_model_id).map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {model && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Box size={14} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">{model.name}</span>
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

      {model && formats.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 mb-2">可用格式资产</h4>
          <div className="space-y-2">
            {formats.map(fmt => {
              const def = FORMAT_DEFS[fmt] || { label: fmt, color: 'bg-gray-100 text-gray-700', desc: '' };
              const childModel = allModels.find(m => m.parent_model_id === model.id && m.format_type === fmt);
              const downloadId = childModel?.id || model.id;
              return (
                <div key={fmt} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${def.color}`}>{def.label}</span>
                      <CheckCircle2 size={14} className="text-emerald-500" />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{def.desc}</div>
                  </div>
                  <a href={modelApi.downloadUrl(downloadId, fmt)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 no-underline cursor-pointer flex items-center gap-2 shrink-0">
                    <Download size={14} /> 下载
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Docker Deployment */}
      {model && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Container size={14} className="text-violet-500" />
            Docker 部署
          </h4>
          {!deployInfo ? (
            <button onClick={generateDeploy} disabled={deployLoading}
              className="w-full py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:bg-gray-300 transition-colors cursor-pointer flex items-center justify-center gap-2">
              {deployLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Container size={14} />}
              {deployLoading ? '生成中...' : '生成 Docker 部署文件'}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">{deployInfo.model_name} ({deployInfo.model_format})</p>
              {/* File tabs */}
              {Object.entries(deployInfo.files as Record<string, string>).map(([name, content]) => (
                <div key={name} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                    <span className="text-xs font-mono text-gray-600">{name}</span>
                    <button onClick={() => copyToClipboard(content as string, name)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600 cursor-pointer">
                      {copiedFile === name ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {copiedFile === name ? '已复制' : '复制'}
                    </button>
                  </div>
                  <pre className="text-[10px] p-3 max-h-40 overflow-y-auto bg-white text-gray-700 font-mono leading-relaxed">{content as string}</pre>
                </div>
              ))}
              {/* Instructions */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-700 mb-2">部署步骤</p>
                <ol className="space-y-1">
                  {deployInfo.instructions.map((s: string, i: number) => (
                    <li key={i} className="text-xs text-gray-600">{s}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          {deployError && <div className="text-xs text-red-500 mt-2">{deployError}</div>}
        </div>
      )}

      {allModels.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">暂无已完成训练的模型</div>
      )}
    </div>
  );
}
