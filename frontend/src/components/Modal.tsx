interface Props { title: string; children: React.ReactNode; onClose: () => void; onConfirm: () => void; dark?: boolean }

export default function Modal({ title, children, onClose, onConfirm, dark }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className={`rounded-xl shadow-xl p-5 w-full max-w-sm mx-4 ${dark ? 'bg-slate-800 border border-slate-700' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
        <h3 className={`text-lg font-semibold mb-3 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{title}</h3>
        {children}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className={`px-4 py-2 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>取消</button>
          <button onClick={onConfirm} className={`px-4 py-2 text-sm font-medium rounded-lg text-white ${dark ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>确定</button>
        </div>
      </div>
    </div>
  );
}
