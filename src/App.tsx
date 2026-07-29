import React from 'react';
import { Component as ImageAutoSlider } from '@/components/ui/image-auto-slider';

function App() {
  return (
    <main className="bg-paper min-h-screen text-ink">
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="space-y-6">
          <p className="text-sm uppercase tracking-[0.35em] text-teal">Our work</p>
          <h1 className="text-4xl sm:text-5xl font-semibold leading-tight">
            Sudzy Studz detail work in motion.
          </h1>
          <p className="max-w-3xl text-ink/75 text-lg leading-8">
            A showcase of jobs, crew, and the detailing progress that defines our student-run nonprofit.
          </p>
        </div>
      </section>

      <section className="min-h-[620px] bg-black">
        <ImageAutoSlider />
      </section>
    </main>
  );
}

export default App;
