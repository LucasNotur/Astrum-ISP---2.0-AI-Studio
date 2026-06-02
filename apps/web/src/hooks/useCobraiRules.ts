import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export interface CobraiRule {
  id: string;
  name: string;
  days_overdue: number;
  action: 'send_message' | 'suspend_signal' | 'reactivate' | 'notify_human';
  message_template?: string;
  active: boolean;
}

export function useCobraiRules() {
  return useQuery({
    queryKey: ['cobrai-rules'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/v2/cobrai/rules');
      return data.rules as CobraiRule[];
    },
  });
}

export function useToggleCobraiRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await apiClient.patch(`/api/v2/cobrai/rules/${id}`, { active });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cobrai-rules'] }),
  });
}

export function useUpdateCobraiRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, template }: { id: string; template: string }) => {
      await apiClient.patch(`/api/v2/cobrai/rules/${id}`, { message_template: template });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cobrai-rules'] }),
  });
}
