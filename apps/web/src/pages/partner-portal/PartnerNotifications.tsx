import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { partnerApi, type PaginatedResponse } from '../../lib/partner-api';

interface PartnerNotification {
  id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-orange-500',
  NORMAL: 'bg-blue-500',
  LOW: 'bg-gray-400',
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function PartnerNotifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['partner-notifications', page, filter],
    queryFn: () =>
      partnerApi<PaginatedResponse<PartnerNotification>>(
        `/notifications?page=${page}&limit=20&filter=${filter}`
      ),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => partnerApi(`/notifications/${id}/read`, { method: 'PATCH' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['partner-notifications'] });
      await queryClient.cancelQueries({ queryKey: ['partner-notification-count'] });

      queryClient.setQueryData(['partner-notification-count'], (old: any) =>
        old ? { ...old, data: { unread: Math.max(0, (old.data?.unread ?? 1) - 1) } } : old
      );
      queryClient.setQueryData(['partner-notifications', page, filter], (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((n: any) => n.id === id ? { ...n, isRead: true } : n) };
      });
      queryClient.setQueryData(['partner-notifications-dropdown'], (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((n: any) => n.id === id ? { ...n, isRead: true } : n) };
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['partner-notification-count'] });
      queryClient.invalidateQueries({ queryKey: ['partner-notifications-dropdown'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => partnerApi('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['partner-notification-count'] });
    },
  });

  const items = data?.data ?? [];
  const pagination = data?.pagination;

  function handleClick(n: PartnerNotification) {
    if (!n.isRead) markReadMutation.mutate(n.id);
    if (n.actionUrl) navigate(n.actionUrl);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => { setFilter(e.target.value as any); setPage(1); }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="all">All</option>
            <option value="unread">Unread only</option>
          </select>
          <button
            onClick={() => markAllReadMutation.mutate()}
            className="text-sm text-green-700 hover:text-green-800 font-medium"
          >
            Mark all as read
          </button>
        </div>
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400">
            {filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left px-6 py-4 hover:bg-gray-50 transition-colors flex gap-4 ${
                  !n.isRead ? 'bg-green-50/40' : ''
                }`}
              >
                <div className="pt-1.5 shrink-0">
                  <div className={`h-2.5 w-2.5 rounded-full ${PRIORITY_COLORS[n.priority] ?? PRIORITY_COLORS.NORMAL}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-sm ${!n.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {n.title}
                    </p>
                    <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{n.message}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-6 py-3">
            <p className="text-sm text-gray-600">
              Page {page} of {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
