'use client';

import { useQuery } from '@tanstack/react-query';

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Request failed (${r.status}): ${text.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

export function useOverview() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: () => fetchJson<any>('/api/overview'),
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

export function useQueue(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const key = qs.toString();
  return useQuery({
    queryKey: ['queue', key],
    queryFn: () => fetchJson<any>(`/api/queue?${key}`),
    staleTime: 10000,
  });
}

export function useTransaction(id: string | null) {
  return useQuery({
    queryKey: ['tx', id],
    queryFn: () => fetchJson<any>(`/api/tx/${id}`),
    enabled: !!id,
    staleTime: 0,
  });
}

export function useRelated(id: string | null) {
  return useQuery({
    queryKey: ['tx-related', id],
    queryFn: () => fetchJson<any>(`/api/tx/${id}/related`),
    enabled: !!id,
    staleTime: 30000,
  });
}

export function useModelPerformance() {
  return useQuery({
    queryKey: ['model-perf'],
    queryFn: () => fetchJson<any>('/api/model'),
    staleTime: 60000,
  });
}

export async function postDecision(id: string, decision: string, note?: string) {
  const r = await fetch(`/api/tx/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, note }),
  });
  if (!r.ok) throw new Error('Decision failed');
  return r.json();
}

export async function postThreshold(threshold: number, costParams?: Record<string, number>) {
  const r = await fetch('/api/threshold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threshold, costParams }),
  });
  if (!r.ok) throw new Error('Threshold simulation failed');
  return r.json();
}

export async function fetchBrief(id: string) {
  const r = await fetch('/api/brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!r.ok) throw new Error('Brief failed');
  return r.json();
}
