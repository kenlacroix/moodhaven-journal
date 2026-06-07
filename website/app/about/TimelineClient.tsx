"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface Milestone {
  date: string;
  title: string;
  description: string;
  projected?: boolean;
}

interface TimelineClientProps {
  milestones: Milestone[];
}

export default function TimelineClient({ milestones }: TimelineClientProps) {
  const prefersReduced = useReducedMotion();
  const completed = milestones.filter((m) => !m.projected);
  const projected = milestones.filter((m) => m.projected);
  const percentComplete = Math.round((completed.length / milestones.length) * 100);

  const entryRefs = useRef<Array<HTMLLIElement | null>>(Array(milestones.length).fill(null));
  const [visible, setVisible] = useState<boolean[]>(Array(milestones.length).fill(false));

  useEffect(() => {
    if (prefersReduced) {
      setVisible(Array(milestones.length).fill(true));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = Number(e.target.getAttribute("data-idx"));
            setVisible((v) => {
              const copy = [...v];
              copy[idx] = true;
              return copy;
            });
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.3 }
    );
    entryRefs.current.forEach((ref) => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, [prefersReduced, milestones.length]);

  return (
    <div className="bg-primary-50 rounded-2xl p-6 lg:p-10">
      {/* Progress bar */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1 bg-primary-100 rounded-full h-2">
          <div
            className="bg-primary-500 h-2 rounded-full transition-[width] duration-1000 ease-out"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
        <span className="text-xs text-neutral-500 whitespace-nowrap">{percentComplete}% complete</span>
      </div>

      <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-4">
        Milestones
      </h3>
      <ol role="list" className="space-y-5 mb-8">
        {completed.map((m, idx) => (
          <motion.li
            key={idx}
            data-idx={idx}
            ref={(el) => { entryRefs.current[idx] = el; }}
            initial={prefersReduced ? false : { opacity: 0, x: 30 }}
            animate={visible[idx] ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="group flex items-start gap-4"
          >
            <div className="flex flex-col items-center mt-1">
              <span className="w-3 h-3 bg-primary-500 rounded-full ring-2 ring-white transition-colors group-hover:bg-accent-cta flex-shrink-0" />
              {idx < completed.length - 1 && <span className="w-0.5 h-full min-h-[20px] bg-primary-200 mt-1" />}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-primary-700 group-hover:text-accent-cta transition-colors">
                {m.title}
              </h4>
              <p className="text-xs text-neutral-400">{m.date}</p>
              <p className="mt-1 text-sm text-neutral-600 leading-relaxed">{m.description}</p>
            </div>
          </motion.li>
        ))}
      </ol>

      {projected.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-4">
            Roadmap
          </h3>
          <ol role="list" className="space-y-5 opacity-60">
            {projected.map((m, idx) => (
              <li key={idx} className="group flex items-start gap-4">
                <div className="flex flex-col items-center mt-1">
                  <span className="w-3 h-3 bg-transparent ring-2 ring-primary-500 rounded-full flex-shrink-0" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-primary-700 flex items-center gap-2">
                    {m.title}
                    <span className="text-[10px] bg-neutral-200 text-neutral-500 px-1.5 py-0.5 rounded">
                      Projected
                    </span>
                  </h4>
                  <p className="text-xs text-neutral-400">{m.date}</p>
                  <p className="mt-1 text-sm text-neutral-600 leading-relaxed">{m.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
