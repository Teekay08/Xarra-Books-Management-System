import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface AiSuggestButtonProps {
  /** API endpoint path (e.g., '/ai/suggest/project') */
  endpoint: string;
  /** Payload to send */
  payload: Record<string, any>;
  /** Called with the AI response data */
  onSuggestion: (data: any) => void;
  /** Button label */
  label?: string;
  /** Disable the button */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function AiSuggestButton({
  endpoint,
  payload,
  onSuggestion,
  label = 'AI Suggest',
  disabled = false,
  className = '',
}: AiSuggestButtonProps) {
  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api<{ available: boolean }>('/ai/status'),
    staleTime: 60_000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => api<{ data: any }>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    onSuccess: (result) => {
      if (result?.data) onSuggestion(result.data);
    },
  });

  if (!aiStatus?.available) return null;

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={disabled || mutation.isPending}
      className={`inline-flex items-center gap-1.5 rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors ${className}`}
    >
      <svg className={`w-3.5 h-3.5 ${mutation.isPending ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        {mutation.isPending ? (
          <path d="M12 2a10 10 0 1 0 10 10" strokeLinecap="round" />
        ) : (
          <>
            <path d="M12 2L12 6M12 18L12 22M2 12L6 12M18 12L22 12" strokeLinecap="round" />
            <path d="M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" strokeLinecap="round" />
          </>
        )}
      </svg>
      {mutation.isPending ? 'Thinking...' : label}
      {mutation.isError && (
        <span className="text-red-500 text-[10px] ml-1">(failed)</span>
      )}
    </button>
  );
}

/**
 * Inline AI suggestion for a single text field.
 * Shows a small sparkle button next to the field label.
 */
export function AiFieldSuggest({
  endpoint,
  payload,
  onSuggestion,
  fieldName = 'description',
}: {
  endpoint: string;
  payload: Record<string, any>;
  onSuggestion: (value: string) => void;
  fieldName?: string;
}) {
  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api<{ available: boolean }>('/ai/status'),
    staleTime: 60_000,
    retry: false,
  });

  const [loading, setLoading] = useState(false);

  if (!aiStatus?.available) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      const result = await api<{ data: { description: string } }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (result?.data?.description) onSuggestion(result.data.description);
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-800 disabled:opacity-50 ml-1"
      title={`AI suggest ${fieldName}`}
    >
      <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        {loading ? (
          <path d="M12 2a10 10 0 1 0 10 10" strokeLinecap="round" />
        ) : (
          <>
            <path d="M12 2L12 6M12 18L12 22M2 12L6 12M18 12L22 12" strokeLinecap="round" />
            <path d="M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" strokeLinecap="round" />
          </>
        )}
      </svg>
      {loading ? 'AI...' : 'AI'}
    </button>
  );
}
