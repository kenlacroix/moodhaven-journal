import React from 'react';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

export function HrvInput({ value, onChange }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-500" htmlFor="still-hrv-input">
        HRV — optional
      </label>
      <input
        id="still-hrv-input"
        type="number"
        min={1}
        max={300}
        placeholder="ms"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
        className="w-24 px-3 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white text-neutral-700
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F28C38] focus:border-[#F28C38]"
      />
    </div>
  );
}
