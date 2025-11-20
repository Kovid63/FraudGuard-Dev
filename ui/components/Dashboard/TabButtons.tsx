import React from 'react';

export default function TabButtons({ tabs, activeTab, onTabSwitch }: { tabs: string[], activeTab: string, onTabSwitch: (tab: string) => void }) {
  return (
    <div className="flex w-full bg-slate-100 rounded-lg p-1 mb-6 gap-2">
      {tabs.map((tab, idx, arr) => (
        <button
          key={tab}
          className={`flex-1 px-8 py-1.5 rounded-lg transition-all font-semibold text-sm
            ${activeTab === tab
              ? "bg-white shadow text-slate-900"
              : "bg-transparent text-slate-500 hover:text-blue-600"}
          `}
          style={{
            marginLeft: idx === 0 ? 0 : undefined,
            marginRight: idx === arr.length - 1 ? 0 : undefined
          }}
          onClick={() => onTabSwitch(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
} 