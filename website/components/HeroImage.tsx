'use client';
import Image from 'next/image';

/** App screenshot used as a standalone hero image where needed (e.g. blog, about). */
export default function HeroImage() {
  return (
    <div className="rounded-xl overflow-hidden shadow-lg ring-1 ring-neutral-200 my-6 mx-auto max-w-2xl">
      <Image
        src="/images/writing-view.png"
        alt="MoodHaven Journal — writing view with mood selector and rich text editor"
        width={960}
        height={640}
        className="w-full h-auto"
        priority
      />
    </div>
  );
}
