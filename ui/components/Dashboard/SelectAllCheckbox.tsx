import React from 'react';

export default function SelectAllCheckbox({ checked, onChange }: { checked: boolean, onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center">
      <input
        type="checkbox"
        className="mr-2 w-4 h-4"
        id="select-all"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <label htmlFor="select-all" className="text-sm font-medium text-gray-700 ml-2">Select All</label>
    </div>
  );
} 