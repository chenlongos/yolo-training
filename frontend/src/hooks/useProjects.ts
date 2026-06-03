import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projects } from '../api/endpoints';

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => projects.list().then((d) => d.items) });
}

export function useProject(id: string) {
  return useQuery({ queryKey: ['projects', id], queryFn: () => projects.get(id), enabled: !!id });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) => projects.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projects.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
