import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { datasets } from '../api/endpoints';

export function useDatasets(projectId: string) {
  return useQuery({ queryKey: ['datasets', projectId], queryFn: () => datasets.list(projectId), enabled: !!projectId });
}

export function useCreateDataset(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) => datasets.create(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets', projectId] }),
  });
}

export function useDatasetImages(datasetId: string) {
  return useQuery({
    queryKey: ['dataset-images', datasetId],
    queryFn: () => datasets.images(datasetId).then((d) => d.items),
    enabled: !!datasetId,
  });
}

export function useLabelClasses(datasetId: string) {
  return useQuery({
    queryKey: ['label-classes', datasetId],
    queryFn: () => datasets.classes(datasetId),
    enabled: !!datasetId,
  });
}
