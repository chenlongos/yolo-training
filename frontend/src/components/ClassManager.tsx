import { useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import type { LabelClass } from '../types';
import Modal from './Modal';

interface Props {
  classes: LabelClass[];
  onDelete: (clsId: string) => Promise<void>;
  onAdd: (name: string, color: string) => Promise<void>;
  onClose: () => void;
}

export default function ClassManager({ classes, onDelete, onAdd, onClose }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#7c3aed');

  async function handleAdd() {
    if (!newName.trim()) return;
    await onAdd(newName.trim(), newColor);
    setShowNew(false); setNewName(''); setNewColor('#7c3aed');
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">类别管理</h1>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer" title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100">
            <Plus className="w-3.5 h-3.5" /> 添加类别
          </button>
          <span className="text-xs text-gray-400">{classes.length} 个类别</span>
        </div>

        <div className="space-y-1 max-h-96 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {classes.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-8">暂无类别</div>
          )}
          {[...classes].sort((a, b) => (a.yolo_index ?? 0) - (b.yolo_index ?? 0)).map(c => {
            const inUse = (c.annotation_count || 0) > 0;
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50">
                <div className="w-4 h-4 rounded shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-sm text-gray-700 flex-1">{c.name}</span>
                <span className="text-xs text-gray-400 font-mono">#{c.yolo_index}</span>
                {inUse && <span className="text-xs text-amber-500" title="该类别被标注使用中">{c.annotation_count} 个标注</span>}
                <button
                  onClick={() => onDelete(c.id)}
                  disabled={inUse}
                  className={`p-1 rounded cursor-pointer ${inUse ? 'text-gray-200 cursor-not-allowed' : 'text-gray-300 hover:text-red-500 hover:bg-red-50'}`}
                  title={inUse ? `该类别被 ${c.annotation_count} 个标注使用，无法删除` : '删除类别'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {showNew && (
        <Modal title="添加类别" onClose={() => setShowNew(false)} onConfirm={handleAdd}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="类别名称"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 mb-3" />
          <div className="flex items-center gap-2">
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-8 h-8 rounded" />
            <span className="text-xs text-gray-500">{newColor}</span>
          </div>
        </Modal>
      )}
    </div>
  );
}
