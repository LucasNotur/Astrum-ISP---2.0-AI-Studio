import { useEffect } from 'react';
import { useNotificationsWebSocket } from '../../hooks/useWebSocket';
import { useNotificationsStore } from '../../store/notifications.store';
import { useTicketsStore } from '../../store/tickets.store';

export function NotificationsListener() {
  const { addNotification } = useNotificationsStore();
  const { receiveTicketFromWS } = useTicketsStore();

  useNotificationsWebSocket((msg: any) => {
    switch (msg.type) {
      case 'payment_received':
        addNotification({
          type: 'payment_received',
          title: '💰 Pagamento recebido',
          message: `R$${((msg.amountCents as number) / 100).toFixed(2)} confirmado`,
          timestamp: msg.timestamp as string,
        });
        break;

      case 'sla_alert':
        addNotification({
          type: 'sla_alert',
          title: '⚠️ SLA próximo do limite',
          message: `Ticket vence em ${msg.minutesLeft} minutos`,
          timestamp: new Date().toISOString(),
          actionUrl: `/tickets/${msg.ticketId}`,
        });
        break;

      case 'ticket_created':
        receiveTicketFromWS(msg.ticket as any);
        addNotification({
          type: 'ticket_created',
          title: '🎫 Novo ticket',
          message: `Ticket criado por cliente`,
          timestamp: new Date().toISOString(),
        });
        break;
    }
  });

  return null; // componente de efeito puro, sem UI
}
