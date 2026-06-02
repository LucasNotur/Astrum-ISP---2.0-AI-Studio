import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export interface KnowledgeDocument {
  id: string;
  filename: string;
  file_type: string;
  status: 'processing' | 'indexed' | 'failed';
  chunks_count: number;
  created_at: string;
  error_message?: string;
}

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/v2/documents');
      return data.documents as KnowledgeDocument[];
    },
    refetchInterval: (query) => {
      // Refetch a cada 3s se houver documento em processamento
      const docs = query.state.data as KnowledgeDocument[] | undefined;
      return docs?.some(d => d.status === 'processing') ? 3000 : false;
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await apiClient.post('/api/v2/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      await apiClient.delete(`/api/v2/documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}
