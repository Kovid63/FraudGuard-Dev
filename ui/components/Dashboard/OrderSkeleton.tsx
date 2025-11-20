import React from 'react';

export default function OrderSkeleton({ idx }: { idx: number }) {
  return (
    <div key={idx} className="flex mb-4 animate-pulse">
      <div>
        <div className="mr-2 w-4 h-4 bg-gray-200 rounded" />
      </div>
      <div className="bg-gray-100 w-full rounded-lg shadow ml-2 border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-24 bg-gray-200 rounded" />
            <div className="h-4 w-1 bg-gray-300 rounded-sm" />
            <div className="h-4 w-32 bg-gray-200 rounded" />
          </div>
          <div className="flex items-center gap-4 text-gray-500 text-sm">
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <span>|</span>
            <div className="h-4 w-20 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
} 