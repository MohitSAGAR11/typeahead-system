import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { StatsSnapshot } from '../types';

export function useStats(intervalMs = 5000) {
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = () => {
    api.stats().then(setStats).catch(() => {});
  };

  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [intervalMs]);

  return stats;
}
