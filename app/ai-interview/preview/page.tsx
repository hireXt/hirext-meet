'use client';

import * as React from 'react';
import EcoDevPreview from './EcoDevPreview';
import '../tailwind.css';

export default function Page() {
  // Off unless explicitly enabled, so production candidates can't reach it.
  if (process.env.NEXT_PUBLIC_ECO_DEV_PREVIEW !== '1') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-8 text-center text-neutral-500">
        <div>
          <h1 className="mb-2 text-lg font-semibold text-neutral-300">Preview disabled</h1>
          <p className="text-sm">
            Set <code className="text-[#2ee6a6]">NEXT_PUBLIC_ECO_DEV_PREVIEW=1</code> to enable this route.
          </p>
        </div>
      </div>
    );
  }
  return <EcoDevPreview />;
}
