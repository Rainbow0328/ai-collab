import { t, useI18n } from '@/i18n';
import type { NotificationItem, NotificationType } from './types';

interface RealtimeNotificationsProps {
  notifications: NotificationItem[];
  loading?: boolean;
  unreadCount?: number;
  onMarkAllRead?: () => void;
  onDismiss?: (notificationId: string) => void;
  emptyText?: string;
}

const typeStyles: Record<NotificationType, { icon: string; bg: string; text: string }> = {
  info: { icon: 'ℹ️', bg: '#eff6ff', text: '#1d4ed8' },
  success: { icon: '✅', bg: '#f0fdf4', text: '#166534' },
  warning: { icon: '⚠️', bg: '#fffbeb', text: '#92400e' },
  error: { icon: '❌', bg: '#fef2f2', text: '#991b1b' },
};

export function RealtimeNotifications({
  notifications,
  loading = false,
  unreadCount = 0,
  onMarkAllRead,
  emptyText,
}: RealtimeNotificationsProps) {
  const { t } = useI18n();
  return (
    <div style={{
      background: '#fff',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontWeight: 600, fontSize: '14px' }}>
          {t('msg.realtimeNotifications')} {unreadCount > 0 && <span style={{ color: '#3b82f6' }}>({unreadCount})</span>}
        </span>
        {unreadCount > 0 && onMarkAllRead && (
          <button
            onClick={onMarkAllRead}
            style={{
              fontSize: '12px',
              color: '#3b82f6',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
            }}
          >
            {t('msg.markAllRead')}
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <NotificationsSkeleton />
        ) : notifications.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            color: '#9ca3af',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔔</div>
            <div style={{ fontSize: '14px' }}>{emptyText ?? t('msg.noNewNotifications')}</div>
          </div>
        ) : (
          <div style={{ padding: '12px' }}>
            {notifications.map((notification) => (
              <NotificationCard key={notification.id} notification={notification} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface NotificationCardProps {
  notification: NotificationItem;
}

function NotificationCard({ notification }: NotificationCardProps) {
  const style = typeStyles[notification.type];

  return (
    <div style={{
      padding: '12px',
      marginBottom: '8px',
      background: notification.isRead ? '#fff' : style.bg,
      border: notification.isRead ? 'none' : `1px solid ${style.bg}`,
      borderRadius: '8px',
      animation: 'slideIn 0.3s ease-out',
    }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '16px' }}>{style.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <div style={{
              fontWeight: notification.isRead ? 400 : 600,
              fontSize: '14px',
              color: style.text,
            }}>
              {notification.title}
            </div>
            {!notification.isRead && (
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#3b82f6',
                flexShrink: 0,
              }} />
            )}
          </div>
          <div style={{
            fontSize: '13px',
            color: style.text,
            opacity: 0.8,
          }}>
            {notification.content}
          </div>
          <div style={{
            fontSize: '11px',
            color: style.text,
            opacity: 0.6,
            marginTop: '4px',
          }}>
            {formatRelativeTime(notification.timestamp)}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <div style={{ padding: '12px' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{
          height: '60px',
          marginBottom: '8px',
          background: '#f9fafb',
          borderRadius: '8px',
          animation: 'pulse 1.5s ease-in-out infinite',
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  );
}

function formatRelativeTime(dateString: string): string {
  try {
    const now = new Date().getTime();
    const date = new Date(dateString).getTime();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) return t('msg.justNow');
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}${t('msg.minutesAgo')}`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}${t('msg.hoursAgo')}`;
    return `${Math.floor(diffSeconds / 86400)}${t('msg.daysAgo')}`;
  } catch {
    return '-';
  }
}
