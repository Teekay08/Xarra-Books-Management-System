import { useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router';

interface UnsavedChangesGuardProps {
  hasUnsavedChanges: boolean;
  message?: string;
}

/**
 * Prevents navigation when there are unsaved changes.
 * Shows a confirmation dialog for both in-app navigation (react-router)
 * and browser-level navigation (tab close, URL change).
 */
export function UnsavedChangesGuard({
  hasUnsavedChanges,
  message = 'You have unsaved changes. Are you sure you want to leave? Your progress may be lost.',
}: UnsavedChangesGuardProps) {
  const blocker = useBlocker(hasUnsavedChanges);

  // Auto-proceed if the form was saved (isDirty became false) while blocker was active.
  // This fixes the race condition where setIsDirty(false) + navigate() in the same
  // onSuccess handler causes the blocker to fire before the state update flushes.
  useEffect(() => {
    if (!hasUnsavedChanges && blocker.state === 'blocked') {
      blocker.proceed();
    }
  }, [hasUnsavedChanges, blocker]);

  // Handle browser-level navigation (close tab, type URL, refresh)
  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    },
    [hasUnsavedChanges],
  );

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  // Don't show modal if changes were already saved (prevents flash)
  if (blocker.state !== 'blocked' || !hasUnsavedChanges) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Unsaved Changes</h3>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={() => blocker.reset()}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Stay on Page
          </button>
          <button
            onClick={() => blocker.proceed()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Leave Page
          </button>
        </div>
      </div>
    </div>
  );
}
