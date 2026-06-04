import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface Notification {
  id: string;
  type: 'payment_received' | 'sla_alert' | 'ticket_created' | 'customer_suspended' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;

  addNotification: (notification: Omit<Notification, 'id' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationsStore = create<NotificationsState>()(
  immer((set) => ({
    notifications: [],
    unreadCount: 0,

    addNotification: (notif) => set((state) => {
      const newNotif: Notification = {
        ...notif,
        id: `notif_${Date.now()}`,
        read: false,
      };
      state.notifications.unshift(newNotif as any);
      state.unreadCount++;

      // Manter máximo 50 notificações
      if (state.notifications.length > 50) {
        state.notifications = state.notifications.slice(0, 50);
      }
    }),

    markAsRead: (id) => set((state) => {
      const notif = state.notifications.find(n => n.id === id);
      if (notif && !notif.read) {
        notif.read = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    }),

    markAllAsRead: () => set((state) => {
      state.notifications.forEach(n => { n.read = true; });
      state.unreadCount = 0;
    }),

    removeNotification: (id) => set((state) => {
      const idx = state.notifications.findIndex(n => n.id === id);
      if (idx !== -1) {
        if (!state.notifications[idx].read) state.unreadCount--;
        state.notifications.splice(idx, 1);
      }
    }),

    clearAll: () => set((state) => {
      state.notifications = [];
      state.unreadCount = 0;
    }),
  })),
);
