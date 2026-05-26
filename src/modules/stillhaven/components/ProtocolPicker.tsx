import React from 'react';

interface Protocol {
  id: string;
  title: string;
  description: string;
  icon: React.JSX.Element;
}

const PROTOCOLS: Protocol[] = [
  {
    id: 'general_activation',
    title: 'Everyday Settling',
    description: 'Stress, mental noise, or wanting to feel more present in your body.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    ),
  },
  {
    id: 'fake_danger',
    title: 'Heightened State',
    description: 'Heart racing, can\'t stop replaying something, body won\'t let you relax.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
  },
];

interface Props {
  value: string | null;
  onChange: (id: string) => void;
}

export function ProtocolPicker({ value, onChange }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-neutral-700 text-center">What brings you here?</p>
      <div className="flex gap-3">
        {PROTOCOLS.map((p) => {
          const selected = value === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              aria-pressed={selected}
              className={[
                'flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-left transition-all duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F28C38]',
                selected
                  ? 'border-[#F28C38] bg-orange-50 text-neutral-800'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300',
              ].join(' ')}
            >
              <span className={selected ? 'text-[#F28C38]' : 'text-neutral-400'}>{p.icon}</span>
              <span className="text-sm font-semibold text-center leading-tight">{p.title}</span>
              <span className="text-xs text-center leading-snug opacity-70">{p.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
