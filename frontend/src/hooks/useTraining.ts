import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { training } from '../api/endpoints';

export function useTrainingJobs(projectId: string) {
  return useQuery({
    queryKey: ['training-jobs', projectId],
    queryFn: () => training.listJobs(projectId).then((d) => d.items),
    enabled: !!projectId,
    refetchInterval: 5000, // auto-poll every 5s for live status
  });
}

export function useTrainingJob(jobId: string) {
  return useQuery({
    queryKey: ['training-job', jobId],
    queryFn: () => training.getJob(jobId),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'queued' ? 3000 : false;
    },
  });
}

export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => training.cancelJob(id),
    onSuccess: (_data, id) => qc.invalidateQueries({ queryKey: ['training-job', id] }),
  });
}
