'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Shell } from '@/components/app/Shell';
import { Overview } from '@/components/app/Overview';
import { Queue } from '@/components/app/Queue';
import { Investigation } from '@/components/app/Investigation';
import { ThresholdTuner } from '@/components/app/ThresholdTuner';
import { ModelPerformance } from '@/components/app/ModelPerformance';
import { useApp } from '@/lib/store';

function ActiveView() {
  const view = useApp((s) => s.view);
  switch (view) {
    case 'overview':
      return <Overview />;
    case 'queue':
      return <Queue />;
    case 'threshold':
      return <ThresholdTuner />;
    case 'model':
      return <ModelPerformance />;
    default:
      return <Overview />;
  }
}

export default function Page() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <Shell>
        <ActiveView />
      </Shell>
      <Investigation />
    </QueryClientProvider>
  );
}
