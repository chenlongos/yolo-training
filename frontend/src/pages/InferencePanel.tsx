import { useState, useRef, useEffect } from 'react';
import { Upload, Play, Loader2, Crosshair, Image, Video, Camera, StopCircle } from 'lucide-react';
import type { TrainedModel } from '../types';
import { withUser } from '../api/client';

interface Detection {
  class: string;
  class_id: number;
  confidence: number;
  bbox?: number[];
  frame?: number;
}

interface ImageResult {
  detections: Detection[];
  count: number;
  image_base64: string;
}

interface VideoResult {
  total_frames: number;
  processed_frames: number;
  fps: number;
  total_detections: number;
  class_summary: Record<string, number>;
  samples: string[];
  detections: Detection[];
}

type Mode = 'image' | 'video' | 'camera';

interface Props {
  models: TrainedModel[];
  activeModelId?: string;
}

export default function InferencePanel({ models, activeModelId }: Props) {
  const [mode, setMode] = useState<Mode>('image');
  const [selectedModel, setSelectedModel] = useState(activeModelId || '');
  const [file, setFile] = useState<{ file: File; url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imgResult, setImgResult] = useState<ImageResult | null>(null);
  const [vidResult, setVidResult] = useState<VideoResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Camera state
  const [camActive, setCamActive] = useState(false);
  const [liveActive, setLiveActive] = useState(false);
  const [liveResult, setLiveResult] = useState<ImageResult | null>(null);
  const [liveFps, setLiveFps] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveTimer = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const fpsRef = useRef<number[]>([]);

  const completedModels = models.filter(m => m.status === 'completed' && m.weights_path);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLiveLoop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  function stopLiveLoop() {
    if (liveTimer.current) { clearTimeout(liveTimer.current); liveTimer.current = 0; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setLiveActive(false);
    fpsRef.current = [];
  }

  function startLiveLoop() {
    if (!selectedModel || !camActive) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws/inference/${selectedModel}?conf=0.25`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setLiveActive(true);
      setLiveResult(null);
      setError('');
      fpsRef.current = [];
      // Start frame sending loop
      function sendFrame() {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const jpegBytes = captureFrameJPEG();
        if (!jpegBytes) { stopLiveLoop(); return; }
        wsRef.current.send(jpegBytes.buffer as ArrayBuffer);
        liveTimer.current = window.setTimeout(sendFrame, 80);
      }
      sendFrame();
    };

    ws.onmessage = (e) => {
      const buf = new Uint8Array(e.data as ArrayBuffer);
      const headerLen = new DataView(buf.buffer).getUint32(0);
      const meta = JSON.parse(new TextDecoder().decode(buf.slice(4, 4 + headerLen)));
      const jpegBytes = buf.slice(4 + headerLen);
      if (jpegBytes.length > 0) {
        const b64 = btoa(String.fromCharCode(...jpegBytes));
        setLiveResult({ detections: meta.detections || [], count: meta.count || 0, image_base64: b64 });
      }
      // FPS tracking
      const now = Date.now();
      fpsRef.current = [...fpsRef.current.filter(t => now - t < 2000), now];
      setLiveFps(fpsRef.current.length / 2);
    };

    ws.onerror = () => { setError('WebSocket 连接失败'); stopLiveLoop(); };
    ws.onclose = () => { if (liveActive) setLiveActive(false); };
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile({ file: f, url: URL.createObjectURL(f) });
    setImgResult(null);
    setVidResult(null);
    setError('');
  }

  function switchMode(m: Mode) {
    stopLiveLoop();
    stopCamera();
    setMode(m);
    setFile(null);
    setLiveResult(null);
    setImgResult(null);
    setVidResult(null);
    setError('');
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCamActive(true);
        setError('');
      }
    } catch {
      setError('无法访问摄像头');
    }
  }

  function stopCamera() {
    stopLiveLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCamActive(false);
  }

  function captureFrameJPEG(): Uint8Array | null {
    const v = videoRef.current;
    if (!v) return null;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    // Get JPEG bytes directly (avoid File/FormData overhead)
    const dataUrl = c.toDataURL('image/jpeg', 0.7);
    const bstr = atob(dataUrl.split(',')[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
    return u8arr;
  }

  async function runInference() {
    if (!selectedModel || !file) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file.file);
      const endpoint = mode === 'video' ? 'predict-video' : 'predict';
      const resp = await fetch(withUser(`/api/v1/models/${selectedModel}/${endpoint}?conf=0.25`), {
        method: 'POST',
        body: fd,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).detail || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (mode === 'video') {
        setVidResult(data);
      } else {
        setImgResult(data);
      }
    } catch (e: any) {
      setError(e.message || 'Inference failed');
    } finally {
      setLoading(false);
    }
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500';
  const lbl = 'text-xs text-gray-500 mb-1 block';

  return (
    <div className="w-full flex-1 space-y-5">
      <h3 className="text-sm font-semibold text-gray-800">实时推理</h3>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {([
          ['image', '图片', Image],
          ['video', '视频', Video],
          ['camera', '摄像头', Camera],
        ] as const).map(([m, label, Icon]) => (
          <button key={m} onClick={() => switchMode(m)}
            className={`flex-1 py-2 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${mode === m ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Model selector */}
      <div>
        <label className={lbl}>选择模型</label>
        <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className={inp}>
          <option value="">-- 选择已训练模型 --</option>
          {completedModels.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.format_type ? ` [${m.format_type.replace('_', ' ').toUpperCase()}]` : ' [PT]'}
              {m.metrics?.mAP50 != null ? ` mAP50:${m.metrics.mAP50.toFixed(3)}` : ''}
            </option>
          ))}
        </select>
        {completedModels.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">暂无已完成训练的模型</p>
        )}
      </div>


      {/* Camera mode */}
      {mode === 'camera' && (
        <div>
          <div className="relative bg-black rounded-lg overflow-hidden">
            {/* Keep video always mounted for frame capture; hide with opacity when showing result */}
            <video ref={videoRef} autoPlay playsInline muted
              className={`w-full aspect-video object-cover ${liveActive && liveResult?.image_base64 ? 'opacity-0 absolute inset-0' : ''}`} />
            {liveActive && liveResult?.image_base64 && (
              <img src={`data:image/jpeg;base64,${liveResult.image_base64}`} alt="live" className="w-full aspect-video object-cover" />
            )}
            {!camActive ? (
              <button onClick={startCamera}
                className="absolute inset-0 flex items-center justify-center bg-black/50 text-white cursor-pointer">
                <div className="text-center">
                  <Camera className="w-8 h-8 mx-auto mb-2" />
                  <span className="text-sm">点击开启摄像头</span>
                </div>
              </button>
            ) : (
              <button onClick={stopCamera}
                className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer z-10">
                <StopCircle size={18} />
              </button>
            )}
            {/* Detection overlay badge */}
            {liveActive && (
              <div className="absolute top-2 left-2 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-black/60 text-white text-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {liveFps > 0 ? `${liveFps.toFixed(0)} FPS` : '...'}
                </span>
                {liveResult && (
                  <span className="px-2 py-0.5 rounded-full bg-black/60 text-white text-xs flex items-center gap-1">
                    <Crosshair size={11} />
                    {liveResult.count} 检测
                  </span>
                )}
              </div>
            )}
          </div>
          {camActive && (
            <div className="flex gap-2 mt-2">
              {!liveActive ? (
                <button onClick={startLiveLoop} disabled={!selectedModel}
                  className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:bg-gray-300 transition-colors cursor-pointer flex items-center justify-center gap-2">
                  <Play size={14} /> 开始实时推理
                </button>
              ) : (
                <button onClick={stopLiveLoop}
                  className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer flex items-center justify-center gap-2">
                  <StopCircle size={14} /> 停止推理
                </button>
              )}
            </div>
          )}
          {/* Detection details */}
          {liveActive && liveResult && liveResult.detections.length > 0 && (
            <div className="space-y-1 mt-2 max-h-40 overflow-y-auto">
              {liveResult.detections.slice(0, 8).map((d, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5 text-xs">
                  <span className="text-gray-700 font-medium">{d.class}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500">[{d.bbox?.map(v => Math.round(v)).join(', ')}]</span>
                    <span className="text-violet-600 font-mono font-bold">{(d.confidence * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File upload (image/video) */}
      {mode !== 'camera' && (
        <div>
          <label className={lbl}>上传{mode === 'video' ? '视频' : '图片'}</label>
          <input ref={fileRef} type="file" accept={mode === 'video' ? 'video/*' : 'image/*'} onChange={handleFile} className="hidden" />
          {!file ? (
            <button onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl py-10 text-center hover:border-violet-400 hover:bg-violet-50/50 transition-colors cursor-pointer">
              <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              <span className="text-sm text-gray-500">点击上传{mode === 'video' ? '视频' : '图片'}</span>
            </button>
          ) : mode === 'image' ? (
            <div className="relative">
              {/* Show annotated result on the image itself; fall back to original preview */}
              <img
                src={imgResult?.image_base64 ? `data:image/jpeg;base64,${imgResult.image_base64}` : file.url}
                alt="preview"
                className="w-full max-h-80 object-contain rounded-lg border"
              />
              {/* Detection overlay on image */}
              {imgResult && imgResult.detections.length > 0 && (
                <div className="absolute bottom-2 left-2 right-2 space-y-1 max-h-32 overflow-y-auto">
                  {imgResult.detections.map((d, i) => (
                    <div key={i} className="flex items-center justify-between bg-black/70 text-white rounded px-2 py-0.5 text-xs backdrop-blur-sm">
                      <span className="font-medium">{d.class}</span>
                      <span className="font-mono">{(d.confidence * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => { setFile(null); setImgResult(null); }}
                className="absolute top-2 right-2 px-2 py-1 text-xs bg-white/90 rounded shadow hover:bg-white">更换</button>
            </div>
          ) : (
            <div className="relative">
              <video src={file.url} controls className="w-full max-h-64 rounded-lg border" />
              <button onClick={() => { setFile(null); setVidResult(null); }}
                className="absolute top-2 right-2 px-2 py-1 text-xs bg-white/90 rounded shadow hover:bg-white">更换</button>
            </div>
          )}
        </div>
      )}

      {/* Run button (image/video only) */}
      {mode !== 'camera' && (
        <button onClick={runInference}
          disabled={!selectedModel || !file || loading}
          className="w-full py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:bg-gray-300 transition-colors flex items-center justify-center gap-2 cursor-pointer">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {loading ? '推理中...' : '开始推理'}
        </button>
      )}

      {error && <div className="text-xs text-red-500 bg-red-50 rounded-lg p-3">{error}</div>}

      {/* Image result summary */}
      {imgResult && (
        <div className="flex items-center gap-2 text-sm">
          <Crosshair className="w-4 h-4 text-violet-500" />
          <span className="text-gray-700 font-medium">{imgResult.count} 个检测结果</span>
        </div>
      )}

      {/* Video result */}
      {vidResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">视频帧率</div>
              <div className="text-sm font-bold text-gray-800">{vidResult.fps} FPS</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">总帧数</div>
              <div className="text-sm font-bold text-gray-800">{vidResult.total_frames}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">检测结果</div>
              <div className="text-sm font-bold text-violet-600">{vidResult.total_detections}</div>
            </div>
          </div>

          {Object.keys(vidResult.class_summary).length > 0 && (
            <div>
              <label className={lbl}>分类统计</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(vidResult.class_summary).map(([cls, count]) => (
                  <span key={cls} className="px-2 py-1 bg-violet-50 text-violet-700 rounded-md text-xs font-medium">
                    {cls}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {vidResult.samples.length > 0 && (
            <div>
              <label className={lbl}>采样帧 ({vidResult.samples.length} 张)</label>
              <div className="grid grid-cols-2 gap-2">
                {vidResult.samples.map((b64, i) => (
                  <img key={i} src={`data:image/jpeg;base64,${b64}`} alt={`frame ${i}`}
                    className="w-full rounded-lg border" />
                ))}
              </div>
            </div>
          )}

          {vidResult.detections.length > 0 && (
            <div>
              <label className={lbl}>检测详情 ({vidResult.detections.length} 条)</label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {vidResult.detections.slice(0, 50).map((d, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5 text-xs">
                    <span className="text-gray-700 font-medium">{d.class}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400">帧 {d.frame}</span>
                      <span className="text-violet-600 font-mono font-bold">{(d.confidence * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
