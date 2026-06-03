import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { models } from '../api/endpoints';

export function useModels(projectId: string) {
  return useQuery({
    queryKey: ['models', projectId],
    queryFn: () => models.list(projectId).then((d) => d.items),
    enabled: !!projectId,
  });
}

export function useModel(modelId: string) {
  return useQuery({
    queryKey: ['model', modelId],
    queryFn: () => models.get(modelId),
    enabled: !!modelId,
  });
}

export function useExportModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, format }: { id: string; format: string }) => models.export(id, format),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['model', vars.id] }),
  });
}

export function useDeleteModel(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => models.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models', projectId] }),
  });
}
