import { useState, useEffect, useRef } from 'react';
import { training as trainApi } from '../api/endpoints';
import type { TrainingJob } from '../types';

interface Props {
  projectId: string;
}

export default function TrainingJobMonitor({ projectId }: Props) {
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    if (!projectId) return;
    async function poll() {
      try {
        const data = await trainApi.listJobs(projectId);
        setJobs(data.items || []);
        const hasRunning = (data.items || []).some(j => j.status === 'running' || j.status === 'queued');
        if (hasRunning) timerRef.current = window.setTimeout(poll, 3000);
      } catch {}
    }
    poll();
    return () => clearTimeout(timerRef.current);
  }, [projectId]);

  const activeJobs = jobs.filter(j => j.status === 'running' || j.status === 'queued');
  if (activeJobs.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      <h2 className="text-sm font-semibold text-gray-800">训练进度</h2>
      {activeJobs.map(job => {
        const statusText: Record<string, string> = { queued: '排队中', running: '训练中', completed: '已完成', failed: '失败' };
        const statusColor: Record<string, string> = { queued: 'bg-amber-500', running: 'bg-cyan-500', completed: 'bg-emerald-500', failed: 'bg-red-500' };
        return (
          <div key={job.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${statusColor[job.status] || 'bg-amber-400'} ${job.status === 'running' ? 'animate-pulse' : ''}`} />
                <span className="text-sm font-medium text-gray-700">{statusText[job.status] || job.status}</span>
                <span className="text-xs text-gray-400 font-mono">{job.id.slice(0, 8)}</span>
              </div>
              <span className="text-xs text-gray-500 font-mono">{job.progress.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${job.status === 'running' ? 'bg-purple-500' : 'bg-amber-500'}`}
                style={{ width: `${job.progress}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1.5 font-mono">Epoch {job.current_epoch} / {job.total_epochs}</p>
            {job.current_metric && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {Object.entries(job.current_metric).slice(0, 4).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded p-2 text-center">
                    <div className="text-[10px] text-gray-500 truncate">{k}</div>
                    <div className="text-xs font-bold text-purple-600 font-mono">{typeof v === 'number' ? v.toFixed(3) : v}</div>
                  </div>
                ))}
              </div>
            )}
            {job.error_message && <p className="text-xs text-red-500 mt-2">{job.error_message}</p>}
          </div>
        );
      })}
    </div>
  );
}
