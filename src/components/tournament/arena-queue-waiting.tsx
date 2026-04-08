"use client";

interface ArenaQueueWaitingProps {
  queuePosition: number | null;
  queueSize: number;
  onCancelQueue: () => void;
}

export function ArenaQueueWaiting({
  queuePosition,
  queueSize,
  onCancelQueue,
}: ArenaQueueWaitingProps) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 rounded-xl border border-white/10 bg-white/5 p-8">
      {/* Loading animation */}
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-white/10 border-t-green-500" />
      </div>

      {/* Status text */}
      <div className="text-center">
        <div className="text-xl font-semibold text-white">
          Finding opponent...
        </div>
        {queuePosition !== null && (
          <div className="mt-2 text-sm text-white/60">
            Position in queue: {queuePosition} of {queueSize}
          </div>
        )}
        <div className="mt-1 text-xs text-white/40">
          You'll be matched with someone close to your score
        </div>
      </div>

      {/* Cancel button */}
      <button
        onClick={onCancelQueue}
        className="rounded-full border border-white/20 bg-white/5 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10"
      >
        Cancel Queue
      </button>
    </div>
  );
}
