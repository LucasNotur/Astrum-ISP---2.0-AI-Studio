import { useAppStore } from '../store/useAppStore';
import { formatTenantDate } from '../lib/dateUtils';

export function useTenantDate() {
    const { companySettings } = useAppStore();
    const timezone = companySettings?.timezone || 'America/Sao_Paulo';
    
    return {
        timezone,
        formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => formatTenantDate(date, timezone, options),
        formatDateTime: (date: Date | string | number) => formatTenantDate(date, timezone, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        formatDateOnly: (date: Date | string | number) => formatTenantDate(date, timezone, { year: 'numeric', month: '2-digit', day: '2-digit' }),
    };
}
