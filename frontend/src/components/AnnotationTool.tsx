import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, HelpCircle, Check, Pencil, Layers, Trash2, Undo2, ZoomIn, ZoomOut, Maximize, Eye, EyeOff } from 'lucide-react';
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

export default function AnnotationTool({ datasetId, images: imgList, classes: initialClasses, startIndex, onClose }: Props) {
  const [imgIdx, setImgIdx] = useState(startIndex);
  const [selectedClass, setSelectedClass] = useState(initialClasses[0]?.id || '');
  const [anns, setAnns] = useState<Annotation[]>([]);
  const [dirty, setDirty] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [cls, setClasses] = useState<LabelClass[]>(initialClasses);
  const [showNewClass, setShowNewClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#7c3aed');
  const [tool, setTool] = useState<'draw' | 'select'>('draw');
  const [zoomLevel, setZoomLevel] = useState(100);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transform = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const curImg = useRef<HTMLImageElement | null>(null);
  const drawing = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<{ origCx: number; origCy: number; origW: number; origH: number; sx: number; sy: number; corner?: string } | null>(null);
  const crosshairRef = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<Annotation[][]>([]);
  const renderRAF = useRef(0);

  const loadImage = useCallback(async () => {
    const img = imgList[imgIdx]; if (!img) return;
    try { const d = await images.get(img.id); setAnns(d.annotations); setDirty(false); undoStack.current = []; } catch {}
    const el = new window.Image(); el.crossOrigin = 'anonymous';
    el.onload = () => {
      curImg.current = el;
      const cv = canvasRef.current; if (!cv) return;
      cv.width = cv.clientWidth; cv.height = cv.clientHeight;
      const s = Math.min((cv.width - 40) / el.naturalWidth, (cv.height - 40) / el.naturalHeight, 1);
      transform.current = { scale: s, offsetX: (cv.width - el.naturalWidth * s) / 2, offsetY: (cv.height - el.naturalHeight * s) / 2 };
      setZoomLevel(Math.round(s * 100));
      render();
    };
    el.src = img.image_url || `/api/v1/images/${img.id}/file`;
  }, [imgIdx]);

  useEffect(() => { loadImage(); }, [loadImage]);

  function ci(cx: number, cy: number) { return { x: (cx - transform.current.offsetX) / transform.current.scale, y: (cy - transform.current.offsetY) / transform.current.scale }; }
  function gp(e: React.MouseEvent) { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  const render = useCallback(() => {
    const c = canvasRef.current; if (!c) return; const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, c.width, c.height);
    const img = curImg.current; if (!img) return;
    const { scale, offsetX, offsetY } = transform.current;
    ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
    if (showLabels) {
      for (const a of anns) {
        const cl = cls.find(x => x.id === a.class_id); const color = cl?.color || '#7c3aed';
        const x = (a.x_center - a.width / 2) * img.naturalWidth, y = (a.y_center - a.height / 2) * img.naturalHeight;
        const w = a.width * img.naturalWidth, h = a.height * img.naturalHeight;
        const sel = a.id === selectedId;
        ctx.strokeStyle = sel ? '#1e293b' : color; ctx.lineWidth = sel ? 3 / scale : 2 / scale;
        ctx.strokeRect(x, y, w, h); ctx.fillStyle = color + '18'; ctx.fillRect(x, y, w, h);
        const lbl = cl?.name || '?'; const fs = Math.max(11, 13 / scale);
        ctx.font = `500 ${fs}px system-ui`; const tw = ctx.measureText(lbl).width;
        ctx.fillStyle = color; ctx.fillRect(x, y - fs - 3, tw + 6, fs + 3); ctx.fillStyle = '#fff'; ctx.fillText(lbl, x + 3, y - 4);
        // Corner resize handles
        if (sel) {
          const hs = 7 / scale;
          const corners = [{ cx: x, cy: y }, { cx: x + w, cy: y }, { cx: x, cy: y + h }, { cx: x + w, cy: y + h }];
          for (const cr of corners) {
            ctx.fillStyle = '#fff'; ctx.fillRect(cr.cx - hs / 2, cr.cy - hs / 2, hs, hs);
            ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.5 / scale; ctx.strokeRect(cr.cx - hs / 2, cr.cy - hs / 2, hs, hs);
          }
        }
      }
    }
    if (drawing.current) {
      const { x1, y1, x2, y2 } = drawing.current;
      ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2 / scale; ctx.setLineDash([5 / scale, 3 / scale]);
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); ctx.setLineDash([]);
    }
    ctx.restore();

    const ch = crosshairRef.current;
    if (tool === 'draw' && ch && !drawing.current) {
      const cx = ch.x * scale + offsetX, cy = ch.y * scale + offsetY;
      ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, c.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(c.width, cy); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [anns, cls, showLabels, tool]);

  useEffect(() => { render(); }, [render]);

  function pushUndo() { undoStack.current.push(JSON.parse(JSON.stringify(anns))); if (undoStack.current.length > 50) undoStack.current.shift(); }
  function undo() { if (undoStack.current.length === 0) return; setAnns(undoStack.current.pop()!); setDirty(true); }
  function del() {
    if (!selectedId) return;
    pushUndo();
    setAnns(p => p.filter(a => a.id !== selectedId));
    setSelectedId(null);
    setDirty(true);
  }

  function onDown(e: React.MouseEvent) {
    const p = gp(e), ip = ci(p.x, p.y); const img = curImg.current;
    if (tool === 'draw') { if (!selectedClass) return; pushUndo(); drawing.current = { x1: ip.x, y1: ip.y, x2: ip.x, y2: ip.y }; }
    else if (img) {
      // Check corner handles of selected box first
      const selAnn = anns.find(a => a.id === selectedId);
      if (selAnn) {
        const sx = (selAnn.x_center - selAnn.width / 2) * img.naturalWidth, sy = (selAnn.y_center - selAnn.height / 2) * img.naturalHeight;
        const sw = selAnn.width * img.naturalWidth, sh = selAnn.height * img.naturalHeight;
        const hs = 10 / transform.current.scale;
        const corners: Record<string, { cx: number; cy: number; fixX: number; fixY: number }> = {
          tl: { cx: sx, cy: sy, fixX: sx + sw, fixY: sy + sh },
          tr: { cx: sx + sw, cy: sy, fixX: sx, fixY: sy + sh },
          bl: { cx: sx, cy: sy + sh, fixX: sx + sw, fixY: sy },
          br: { cx: sx + sw, cy: sy + sh, fixX: sx, fixY: sy },
        };
        for (const [key, cr] of Object.entries(corners)) {
          if (Math.abs(ip.x - cr.cx) < hs && Math.abs(ip.y - cr.cy) < hs) {
            pushUndo();
            dragRef.current = { origCx: selAnn.x_center, origCy: selAnn.y_center, origW: selAnn.width, origH: selAnn.height, sx: ip.x, sy: ip.y, corner: key };
            render(); return;
          }
        }
      }
      // Check if clicking on any annotation
      setSelectedId(null);
      for (const a of anns) {
        const x = (a.x_center - a.width / 2) * img.naturalWidth, y = (a.y_center - a.height / 2) * img.naturalHeight;
        const w = a.width * img.naturalWidth, h = a.height * img.naturalHeight;
        if (ip.x >= x && ip.x <= x + w && ip.y >= y && ip.y <= y + h) {
          setSelectedId(a.id);
          dragRef.current = { origCx: a.x_center, origCy: a.y_center, origW: a.width, origH: a.height, sx: ip.x, sy: ip.y };
          break;
        }
      }
    }
    render();
  }

  function onMove(e: React.MouseEvent) {
    const ip = ci(gp(e).x, gp(e).y); const img = curImg.current;
    if (drawing.current) { drawing.current.x2 = ip.x; drawing.current.y2 = ip.y; render(); }
    else if (dragRef.current && selectedId && img) {
      const d = dragRef.current;
      if (d.corner) {
        // Resize — corner drag
        const dx = (ip.x - d.sx) / img.naturalWidth, dy = (ip.y - d.sy) / img.naturalHeight;
        const clamp = (v: number) => Math.max(0.001, Math.min(1, v));
        let { origCx, origCy, origW, origH } = d;
        let ncx = origCx, ncy = origCy, nw = origW, nh = origH;
        switch (d.corner) {
          case 'tl': ncx = clamp(origCx + dx / 2); ncy = clamp(origCy + dy / 2); nw = clamp(origW - dx); nh = clamp(origH - dy); break;
          case 'tr': ncx = clamp(origCx + dx / 2); ncy = clamp(origCy + dy / 2); nw = clamp(origW + dx); nh = clamp(origH - dy); break;
          case 'bl': ncx = clamp(origCx + dx / 2); ncy = clamp(origCy + dy / 2); nw = clamp(origW - dx); nh = clamp(origH + dy); break;
          case 'br': ncx = clamp(origCx + dx / 2); ncy = clamp(origCy + dy / 2); nw = clamp(origW + dx); nh = clamp(origH + dy); break;
        }
        setAnns(prev => prev.map(a => a.id === selectedId ? { ...a, x_center: ncx, y_center: ncy, width: nw, height: nh } : a));
      } else {
        // Move
        const dx = ip.x - d.sx, dy = ip.y - d.sy;
        setAnns(prev => prev.map(a => a.id === selectedId
          ? { ...a, x_center: Math.max(0, Math.min(1, d.origCx + dx / img.naturalWidth)), y_center: Math.max(0, Math.min(1, d.origCy + dy / img.naturalHeight)) }
          : a));
      }
      setDirty(true);
    } else if (tool === 'draw') { crosshairRef.current = ip; render(); }
    else if (tool === 'select' && img && selectedId) {
      // Update cursor for resize handles
      const sel = anns.find(a => a.id === selectedId);
      if (sel) {
        const sx = (sel.x_center - sel.width / 2) * img.naturalWidth, sy = (sel.y_center - sel.height / 2) * img.naturalHeight;
        const sw = sel.width * img.naturalWidth, sh = sel.height * img.naturalHeight;
        const hs = 10 / transform.current.scale;
        const corners = [{ cx: sx, cy: sy }, { cx: sx + sw, cy: sy }, { cx: sx, cy: sy + sh }, { cx: sx + sw, cy: sy + sh }];
        const near = corners.some(c => Math.abs(ip.x - c.cx) < hs && Math.abs(ip.y - c.cy) < hs);
        const cv = canvasRef.current; if (cv) cv.style.cursor = near ? 'nesw-resize' : 'move';
      }
    }
  }

  function onLeave() { crosshairRef.current = null; const cv = canvasRef.current; if (cv) cv.style.cursor = tool === 'draw' ? 'crosshair' : 'default'; render(); }
  function onUp() {
    const img = curImg.current;
    if (dragRef.current?.corner) { dragRef.current = null; render(); return; }
    if (drawing.current && img) {
      const { x1, y1, x2, y2 } = drawing.current;
      const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
      drawing.current = null;
      if (w >= 5 && h >= 5 && selectedClass) {
        const newId = 'tmp_' + Date.now();
        setAnns(prev => [...prev, {
          id: newId, image_id: imgList[imgIdx]?.id || '', class_id: selectedClass,
          class_name: cls.find(c => c.id === selectedClass)?.name || '',
          x_center: (x + w / 2) / img.naturalWidth, y_center: (y + h / 2) / img.naturalHeight,
          width: w / img.naturalWidth, height: h / img.naturalHeight,
        }]);
        setSelectedId(newId);
        setDirty(true);
      }
    }
    dragRef.current = null; render();
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const p = gp(e as any), ip = ci(p.x, p.y);
    const ns = Math.min(5, Math.max(0.1, transform.current.scale * (e.deltaY < 0 ? 1.15 : 0.85)));
    transform.current = { scale: ns, offsetX: p.x - ip.x * ns, offsetY: p.y - ip.y * ns };
    setZoomLevel(Math.round(ns * 100)); render();
  }

  function zoom(ns: number) {
    const c = canvasRef.current; if (!c) return;
    const cx = c.width / 2, cy = c.height / 2;
    const ip = ci(cx, cy);
    transform.current = { scale: ns, offsetX: cx - ip.x * ns, offsetY: cy - ip.y * ns };
    setZoomLevel(Math.round(ns * 100)); render();
  }

  async function save() { if (!imgList[imgIdx]) return; await annApi.save(imgList[imgIdx].id, { annotations: anns.map(a => ({ class_id: a.class_id, x_center: a.x_center, y_center: a.y_center, width: a.width, height: a.height })) }); setDirty(false); undoStack.current = []; }
  async function addClass() { await datasets.createClass(datasetId, { name: newClassName, color: newClassColor }); setShowNewClass(false); setNewClassName(''); setClasses(await datasets.classes(datasetId)); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.target instanceof HTMLInputElement) return; const k = e.key.toLowerCase(); if (k === 'd') setTool('draw'); if (k === 's') setTool('select'); if (k === 'delete' || k === 'backspace') { e.preventDefault(); del(); } if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save(); } if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); } if (k === '[') setImgIdx(i => Math.max(0, i - 1)); if (k === ']') setImgIdx(i => Math.min(imgList.length - 1, i + 1)); if (k === 'escape') { setSelectedId(null); render(); } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [anns, imgList.length, selectedClass]);

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" /> 返回</button>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-700">{imgList[imgIdx]?.filename}</span>
          <button className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 ml-2"><HelpCircle className="w-3.5 h-3.5" /> 帮助</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{imgIdx + 1} / {imgList.length}</span>
          <button onClick={save} disabled={!dirty} className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-300 font-medium">{dirty ? '保存' : '已保存'}</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-48 border-r border-gray-200 flex flex-col shrink-0 bg-gray-50/50">
          <div className="p-3 border-b border-gray-200"><div className="text-xs font-semibold text-gray-500 uppercase">图片</div></div>
          <div className="flex-1 overflow-y-auto">
            {imgList.map((im, i) => (
              <div key={im.id} onClick={() => setImgIdx(i)} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs border-b border-gray-100 ${i === imgIdx ? 'bg-purple-50 text-purple-700 border-l-2 border-l-purple-500' : 'text-gray-600 hover:bg-gray-100'}`}>
                <span className="truncate flex-1">{im.filename}</span>
                {im.status === 'annotated' && <Check className="w-3 h-3 text-emerald-500 shrink-0" />}
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200">
            <div className="flex items-center justify-between px-3 py-2"><span className="text-xs font-semibold text-gray-500 uppercase">类别</span><button onClick={() => setShowNewClass(true)} className="text-xs text-purple-600 hover:text-purple-800">+</button></div>
            <div className="max-h-40 overflow-y-auto">
              {cls.map(c => (
                <div key={c.id} onClick={() => setSelectedClass(c.id)} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs ${c.id === selectedClass ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                  <div className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: c.color }} /><span className="truncate">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex-1 relative bg-gray-100 flex items-center justify-center">
          <canvas ref={canvasRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onWheel={onWheel} onMouseLeave={onLeave}
            style={{ width: '100%', height: '100%', cursor: tool === 'draw' ? 'crosshair' : 'default' }} />
          <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-white rounded-lg shadow-sm border border-gray-200 p-1">
            <button onClick={() => zoom(Math.max(0.1, transform.current.scale * 0.7))} className="p-1.5 hover:bg-gray-100 rounded"><ZoomOut className="w-4 h-4 text-gray-600" /></button>
            <span className="text-xs text-gray-500 px-1 font-mono w-10 text-center">{zoomLevel}%</span>
            <button onClick={() => zoom(Math.min(5, transform.current.scale * 1.3))} className="p-1.5 hover:bg-gray-100 rounded"><ZoomIn className="w-4 h-4 text-gray-600" /></button>
            <button onClick={() => { const c = canvasRef.current; if (!c || !curImg.current) return; const img = curImg.current; const s = Math.min((c.width - 40) / img.naturalWidth, (c.height - 40) / img.naturalHeight, 1); transform.current = { scale: s, offsetX: (c.width - img.naturalWidth * s) / 2, offsetY: (c.height - img.naturalHeight * s) / 2 }; setZoomLevel(Math.round(s * 100)); render(); }} className="p-1.5 hover:bg-gray-100 rounded"><Maximize className="w-4 h-4 text-gray-600" /></button>
          </div>
        </div>

        <aside className="w-56 border-l border-gray-200 flex flex-col shrink-0 bg-gray-50/50 p-3 gap-3">
          <div className="text-xs font-semibold text-gray-500 uppercase">工具</div>
          <div className="space-y-1">
            <button onClick={() => setTool('draw')} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${tool === 'draw' ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-100'}`}><Pencil className="w-4 h-4" /> 画框 (D)</button>
            <button onClick={() => setTool('select')} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${tool === 'select' ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-100'}`}><Layers className="w-4 h-4" /> 选择 (S)</button>
          </div>
          <div className="border-t border-gray-200 pt-3 space-y-1">
            <button onClick={undo} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-600 hover:bg-gray-100"><Undo2 className="w-4 h-4" /> 撤销 (Ctrl+Z)</button>
            <button onClick={del} disabled={!selectedId} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-500 hover:bg-red-50 disabled:text-gray-300 disabled:cursor-not-allowed"><Trash2 className="w-4 h-4" /> 删除选中</button>
          </div>
          <div className="border-t border-gray-200 pt-3">
            <button onClick={() => setShowLabels(!showLabels)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-600 hover:bg-gray-100">{showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}{showLabels ? '隐藏标签' : '显示标签'}</button>
          </div>
          <div className="border-t border-gray-200 pt-3"><div className="text-xs text-gray-500"><span className="font-mono">{anns.length}</span> 个标注</div></div>
        </aside>
      </div>

      {showNewClass && <Modal title="添加类别" onClose={() => setShowNewClass(false)} onConfirm={addClass}>
        <input value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="类别名称" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 mb-3" />
        <div className="flex items-center gap-2"><input type="color" value={newClassColor} onChange={e => setNewClassColor(e.target.value)} className="w-8 h-8 rounded" /><span className="text-xs text-gray-500">{newClassColor}</span></div>
      </Modal>}
    </div>
  );
}
