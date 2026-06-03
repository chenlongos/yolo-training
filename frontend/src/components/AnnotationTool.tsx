import { useState, useEffect, useRef, useCallback } from 'react';
import { images, annotations as annApi, datasets } from '../api/endpoints';
import type { Image, Annotation, LabelClass } from '../types';
import Modal from './Modal';

interface Props {
  datasetId: string;
  images: Image[];
  classes: LabelClass[];
  startIndex: number;
  onClose: () => void;
}

export default function AnnotationTool({ datasetId, images: imgList, classes, startIndex, onClose }: Props) {
  const [imgIdx, setImgIdx] = useState(startIndex);
  const [selectedClass, setSelectedClass] = useState('');
  const [anns, setAnns] = useState<Annotation[]>([]);
  const [dirty, setDirty] = useState(false);
  const [showNewClass, setShowNewClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#10b981');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transform = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const curImg = useRef<HTMLImageElement | null>(null);
  const drawing = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const tool = useRef<'draw' | 'select'>('draw');
  const selectedId = useRef<string | null>(null);
  const dragRef = useRef<any>(null);

  const loadImage = useCallback(async () => {
    const img = imgList[imgIdx]; if (!img) return;
    try { const d = await images.get(img.id); setAnns(d.annotations); } catch {}
    const el = new window.Image(); el.crossOrigin = 'anonymous';
    el.onload = () => {
      curImg.current = el;
      const cv = canvasRef.current; if (!cv) return;
      cv.width = cv.clientWidth; cv.height = cv.clientHeight;
      const s = Math.min((cv.width - 40) / el.naturalWidth, (cv.height - 40) / el.naturalHeight, 1);
      transform.current = { scale: s, offsetX: (cv.width - el.naturalWidth * s) / 2, offsetY: (cv.height - el.naturalHeight * s) / 2 };
      render();
    };
    el.src = img.image_url || `/api/v1/images/${img.id}/file`;
  }, [imgIdx, imgList]);

  useEffect(() => { loadImage(); }, [loadImage]);

  function ci(cx: number, cy: number) { return { x: (cx - transform.current.offsetX) / transform.current.scale, y: (cy - transform.current.offsetY) / transform.current.scale }; }
  function gp(e: React.MouseEvent) { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  function render() {
    const c = canvasRef.current; if (!c) return; const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, c.width, c.height);
    const img = curImg.current; if (!img) return;
    const { scale, offsetX, offsetY } = transform.current;
    ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
    for (const a of anns) { const cls = classes.find(x => x.id === a.class_id); const color = cls?.color || '#10b981'; const x = (a.x_center - a.width / 2) * img.naturalWidth, y = (a.y_center - a.height / 2) * img.naturalHeight; const w = a.width * img.naturalWidth, h = a.height * img.naturalHeight; ctx.strokeStyle = a.id === selectedId.current ? '#fff' : color; ctx.lineWidth = a.id === selectedId.current ? 3 / scale : 2 / scale; ctx.strokeRect(x, y, w, h); ctx.fillStyle = color + '18'; ctx.fillRect(x, y, w, h); const lbl = cls?.name || '?'; const fs = Math.max(11, 13 / scale); ctx.font = `500 ${fs}px system-ui`; const tw = ctx.measureText(lbl).width; ctx.fillStyle = color; ctx.fillRect(x, y - fs - 3, tw + 6, fs + 3); ctx.fillStyle = '#fff'; ctx.fillText(lbl, x + 3, y - 4); }
    if (drawing.current) { const { x1, y1, x2, y2 } = drawing.current; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / scale; ctx.setLineDash([5 / scale, 3 / scale]); ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); ctx.setLineDash([]); }
    ctx.restore();
  }

  function onDown(e: React.MouseEvent) { const p = gp(e), ip = ci(p.x, p.y); const img = curImg.current; if (tool.current === 'draw') { if (!selectedClass) return; drawing.current = { x1: ip.x, y1: ip.y, x2: ip.x, y2: ip.y }; } else if (img) { selectedId.current = null; for (const a of anns) { const x = (a.x_center - a.width/2)*img.naturalWidth, y = (a.y_center - a.height/2)*img.naturalHeight, w = a.width*img.naturalWidth, h = a.height*img.naturalHeight; if (ip.x >= x && ip.x <= x+w && ip.y >= y && ip.y <= y+h) { selectedId.current = a.id; dragRef.current = { ann: {...a}, sx: ip.x, sy: ip.y }; break; } } } render(); }
  function onMove(e: React.MouseEvent) { const ip = ci(gp(e).x, gp(e).y); const img = curImg.current; if (drawing.current) { drawing.current.x2 = ip.x; drawing.current.y2 = ip.y; } else if (dragRef.current && selectedId.current && img) { const dx = ip.x - dragRef.current.sx, dy = ip.y - dragRef.current.sy; setAnns(prev => prev.map(a => a.id === selectedId.current ? {...a, x_center: Math.max(0,Math.min(1,a.x_center+dx/img.naturalWidth)), y_center: Math.max(0,Math.min(1,a.y_center+dy/img.naturalHeight))} : a)); setDirty(true); } render(); }
  function onUp() { const img = curImg.current; if (drawing.current && img) { const {x1,y1,x2,y2}=drawing.current; const x=Math.min(x1,x2),y=Math.min(y1,y2),w=Math.abs(x2-x1),h=Math.abs(y2-y1); drawing.current=null; if (w>=5 && h>=5 && selectedClass) { setAnns(prev=>[...prev,{id:'tmp_'+Date.now(),image_id:imgList[imgIdx]?.id||'',class_id:selectedClass,class_name:classes.find(c=>c.id===selectedClass)?.name||'',x_center:(x+w/2)/img.naturalWidth,y_center:(y+h/2)/img.naturalHeight,width:w/img.naturalWidth,height:h/img.naturalHeight}]); setDirty(true); } } dragRef.current=null; render(); }
  function onWheel(e: React.WheelEvent) { e.preventDefault(); const p=gp(e as any),ip=ci(p.x,p.y); const ns=Math.min(5,Math.max(0.1,transform.current.scale*(e.deltaY<0?1.15:0.85))); transform.current={scale:ns,offsetX:p.x-ip.x*ns,offsetY:p.y-ip.y*ns}; render(); }
  async function save() { if (!imgList[imgIdx]) return; await annApi.save(imgList[imgIdx].id, {annotations: anns.map(a=>({class_id:a.class_id,x_center:a.x_center,y_center:a.y_center,width:a.width,height:a.height}))}); setDirty(false); }
  function del() { if (!selectedId.current) return; setAnns(p=>p.filter(a=>a.id!==selectedId.current)); selectedId.current=null; setDirty(true); }
  async function addClass() { await datasets.createClass(datasetId, { name: newClassName, color: newClassColor }); setShowNewClass(false); setNewClassName(''); classes.push({ id: '', dataset_id: datasetId, name: newClassName, yolo_index: classes.length, color: newClassColor }); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.target instanceof HTMLInputElement) return; const k = e.key.toLowerCase(); if (k === 'd') tool.current = 'draw'; if (k === 's') tool.current = 'select'; if (k === 'delete'||k==='backspace') { e.preventDefault(); del(); render(); } if ((e.ctrlKey||e.metaKey) && k === 's') { e.preventDefault(); save(); } if (k === '[') setImgIdx(i => Math.max(0, i-1)); if (k === ']') setImgIdx(i => Math.min(imgList.length-1, i+1)); if (k === 'escape') onClose(); }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [anns, imgList.length, selectedClass]);

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 text-sm">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">返回</button>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300">{imgList[imgIdx]?.filename}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={() => tool.current='draw'} className={`px-2 py-1 rounded ${tool.current==='draw'?'bg-emerald-500/20 text-emerald-400':'text-slate-400'}`}>画框 (D)</button>
          <button onClick={() => tool.current='select'} className={`px-2 py-1 rounded ${tool.current==='select'?'bg-cyan-500/20 text-cyan-400':'text-slate-400'}`}>选择 (S)</button>
          <button onClick={() => { del(); render(); }} className="px-2 py-1 text-red-400">删除</button>
          <span className="text-slate-700">|</span>
          <span className="text-slate-500 font-mono">{imgIdx+1}/{imgList.length}</span>
          <button onClick={() => setImgIdx(i => Math.max(0,i-1))} className="text-slate-400">←</button>
          <button onClick={() => setImgIdx(i => Math.min(imgList.length-1,i+1))} className="text-slate-400">→</button>
          <button onClick={save} disabled={!dirty} className="px-3 py-1 rounded bg-gradient-to-r from-emerald-600 to-emerald-700 text-white disabled:from-slate-700 disabled:text-slate-500">{dirty ? '保存 *' : '已保存'}</button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-40 bg-slate-900/50 border-r border-slate-800 overflow-y-auto">
          <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-800">类别</div>
          {classes.map(c => (<div key={c.id} onClick={() => setSelectedClass(c.id)} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs ${c.id===selectedClass?'bg-slate-800 text-slate-200':'text-slate-500 hover:bg-slate-800/30'}`}><div className="w-3 h-3 rounded shrink-0" style={{backgroundColor: c.color}} /><span className="truncate">{c.name}</span></div>))}
          <button onClick={() => setShowNewClass(true)} className="w-full text-xs text-emerald-400 px-3 py-2">+ 添加类别</button>
        </div>
        <div className="flex-1"><canvas ref={canvasRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onWheel={onWheel} style={{width:'100%',height:'100%',cursor:tool.current==='draw'?'crosshair':'default'}} /></div>
      </div>
      {showNewClass && <Modal dark title="添加类别" onClose={() => setShowNewClass(false)} onConfirm={addClass}>
        <input value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="类别名称" className="w-full bg-slate-900/50 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 outline-none mb-3" />
        <div className="flex items-center gap-2"><input type="color" value={newClassColor} onChange={e => setNewClassColor(e.target.value)} className="w-8 h-8 rounded" /><span className="text-xs text-slate-500">{newClassColor}</span></div>
      </Modal>}
    </div>
  );
}
