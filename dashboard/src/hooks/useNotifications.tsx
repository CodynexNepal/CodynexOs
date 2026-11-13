"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { codynexApi } from "@/lib/codynexOs";
import { useAuth } from "@/hooks/useAuth";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import type { NotificationItem, ApprovalItem } from "@/types/os";

export interface NotificationToast {
  id: string;
  title: string;
  message: string;
  category: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  linkUrl?: string | null;
  createdAt: string;
}

interface NotificationsContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  pendingApprovalsCount: number;
  loading: boolean;
  toasts: NotificationToast[];
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  sendTestNotification: (data?: Partial<NotificationItem>) => Promise<void>;
  refetch: () => Promise<void>;
  dismissToast: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function playNotificationChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch {
    // Graceful fallback if audio context is blocked
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [toasts, setToasts] = useState<NotificationToast[]>([]);

  const fetchAll = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const [notifsRes, approvalsRes] = await Promise.allSettled([
        codynexApi.notifications.list(),
        codynexApi.approvals.list(),
      ]);

      if (notifsRes.status === "fulfilled" && notifsRes.value?.data?.data) {
        setNotifications(notifsRes.value.data.data as NotificationItem[]);
      }
      if (approvalsRes.status === "fulfilled" && approvalsRes.value?.data?.data) {
        setPendingApprovals(approvalsRes.value.data.data as ApprovalItem[]);
      }
    } catch (err) {
      console.warn("Failed to load notifications or approvals", err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAll();
    } else {
      setNotifications([]);
      setPendingApprovals([]);
      setToasts([]);
    }
  }, [isAuthenticated, fetchAll]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: NotificationToast) => {
    setToasts((prev) => [toast, ...prev.slice(0, 3)]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 6000);
  }, []);

  // Handle real-time socket events
  const handleSocketEvent = useCallback(
    (eventName: string, payload?: unknown) => {
      if (eventName === "notification:created" && payload) {
        const item = payload as Partial<NotificationItem>;
        if (item.id) {
          const newNotif: NotificationItem = {
            id: item.id,
            userId: item.userId || "",
            category: item.category || "GENERAL",
            severity: item.severity || "INFO",
            title: item.title || "New Notification",
            message: item.message || "",
            linkUrl: item.linkUrl ?? null,
            channelSent: item.channelSent || ["DASHBOARD"],
            isRead: false,
            createdAt: item.createdAt || new Date().toISOString(),
          };

          setNotifications((prev) => {
            const exists = prev.some((n) => n.id === newNotif.id);
            if (exists) return prev;
            return [newNotif, ...prev];
          });

          playNotificationChime();
          addToast({
            id: newNotif.id,
            title: newNotif.title,
            message: newNotif.message,
            category: newNotif.category,
            severity: newNotif.severity,
            linkUrl: newNotif.linkUrl,
            createdAt: newNotif.createdAt,
          });
        }
      } else if (eventName === "notification:read" && payload) {
        const { id } = payload as { id?: string };
        if (id) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
          );
        }
      } else if (eventName === "notification:all_read") {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      } else if (eventName === "approval:reviewed") {
        // Refresh approvals and notifications
        fetchAll();
      }
    },
    [addToast, fetchAll]
  );

  useDomainSocket(handleSocketEvent);

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update: red number decreases immediately like YouTube!
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    try {
      await codynexApi.notifications.markRead(id);
    } catch (err) {
      console.warn("Failed to mark notification as read", err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    // Optimistic update: red number disappears immediately like YouTube!
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await codynexApi.notifications.markAllRead();
    } catch (err) {
      console.warn("Failed to mark all notifications as read", err);
    }
  }, []);

  const sendTestNotification = useCallback(
    async (data?: Partial<NotificationItem>) => {
      try {
        await codynexApi.notifications.sendTest(data as Record<string, unknown>);
      } catch (err) {
        console.warn("Failed to send test notification", err);
      }
    },
    []
  );

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  const pendingApprovalsCount = useMemo(() => {
    return pendingApprovals.filter((a) => a.status === "PENDING").length;
  }, [pendingApprovals]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      pendingApprovalsCount,
      loading,
      toasts,
      markAsRead,
      markAllAsRead,
      sendTestNotification,
      refetch: fetchAll,
      dismissToast,
    }),
    [
      notifications,
      unreadCount,
      pendingApprovalsCount,
      loading,
      toasts,
      markAsRead,
      markAllAsRead,
      sendTestNotification,
      fetchAll,
      dismissToast,
    ]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
