'use client';

import * as React from 'react';
import { useIsRecording, useRoomContext } from '@livekit/components-react';
import toast from 'react-hot-toast';

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function useRecording() {
  const isRecording = useIsRecording();
  const room = useRoomContext();
  const endpoint = process.env.NEXT_PUBLIC_LK_RECORD_ENDPOINT;
  const [processing, setProcessing] = React.useState(false);
  const pendingRef = React.useRef<boolean | null>(null);
  const startedAtRef = React.useRef<number | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (isRecording) {
      if (startedAtRef.current === null) {
        startedAtRef.current = Date.now();
      }
      const tick = () =>
        setElapsed(Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
      tick();
      const timer = setInterval(tick, 1000);
      return () => clearInterval(timer);
    }
    startedAtRef.current = null;
    setElapsed(0);
  }, [isRecording]);

  React.useEffect(() => {
    if (pendingRef.current !== null && isRecording === pendingRef.current) {
      pendingRef.current = null;
      setProcessing(false);
    }
  }, [isRecording]);

  const toggle = React.useCallback(async () => {
    if (!endpoint) {
      toast.error('Recording is not configured on this deployment');
      return;
    }
    if (room.isE2EEEnabled) {
      toast.error('Recording of encrypted meetings is currently not supported');
      return;
    }
    if (processing) return;
    setProcessing(true);
    pendingRef.current = !isRecording;
    try {
      const action = isRecording ? 'stop' : 'start';
      const response = await fetch(
        `${endpoint}/${action}?roomName=${encodeURIComponent(room.name)}`,
      );
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error handling recording request:', error);
      pendingRef.current = null;
      setProcessing(false);
      toast.error('Failed to update recording. Check server logs.');
    }
  }, [endpoint, isRecording, processing, room]);

  return {
    isRecording,
    processing,
    toggle,
    durationLabel: formatDuration(elapsed),
    available: !!endpoint,
  };
}
