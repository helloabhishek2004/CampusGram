"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { CampusInfoVisual, ComplaintsVisual, LostFoundVisual } from "./onboarding-visuals";
import { setOnboardingCompleted } from "../../lib/auth/client-session";
import { CampusGramLogo } from "../layout/logo";
import { cn } from "@smart-campus/utils";

interface Step {
  id: number;
  tag: string;
  title: string;
  description: string;
  visual: React.ReactNode;
}

const STEPS: Step[] = [
  {
    id: 1,
    tag: "Campus Information",
    title: "Everything happening on campus, in one place.",
    description: "Official notices, circulars, department announcements, and class communications delivered without noise.",
    visual: <CampusInfoVisual />,
  },
  {
    id: 2,
    tag: "Campus Complaints",
    title: "Report issues and track them to resolution.",
    description: "Submit infrastructure and academic grievances. Track status changes in real time until resolved.",
    visual: <ComplaintsVisual />,
  },
  {
    id: 3,
    tag: "Lost & Found",
    title: "Lost something? Found something?",
    description: "CampusGram matches reported items with verified belongings in security custody for safe handover.",
    visual: <LostFoundVisual />,
  },
];

export function OnboardingScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  const handleFinish = () => {
    setOnboardingCompleted(true);
    router.push("/login");
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const step = STEPS[currentStep];

  return (
    <div className="relative flex min-h-screen min-h-[100svh] flex-col overflow-hidden bg-zinc-50 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:px-10 sm:py-8 lg:px-14 lg:py-10">
      <div className="absolute left-5 top-5 z-20 sm:left-10 sm:top-8 lg:left-14 lg:top-10">
        <CampusGramLogo size="sm" />
      </div>

      <button
        type="button"
        onClick={handleFinish}
        className="absolute right-5 top-5 z-20 min-h-11 rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-600 shadow-sm transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white sm:right-10 sm:top-8 lg:right-14 lg:top-10"
        aria-label="Skip onboarding"
      >
        Skip
      </button>

      <main className="relative z-10 m-auto grid w-full max-w-7xl items-center gap-8 py-12 sm:py-16 lg:grid-cols-[minmax(0,0.82fr)_minmax(32rem,1.18fr)] lg:gap-16 lg:py-10">
        <div key={`copy-${step.id}`} className="order-2 max-w-xl space-y-5 text-center animate-apple-in lg:order-1 lg:text-left">
          <span className="inline-flex rounded-full border border-zinc-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {step.tag}
          </span>
          <h1 className="max-w-lg text-4xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-100 sm:text-5xl lg:text-6xl lg:leading-[1.05]">
            {step.title}
          </h1>
          <p className="max-w-md text-base leading-7 text-zinc-600 dark:text-zinc-400 sm:text-lg">
            {step.description}
          </p>
        </div>

        <div key={`visual-${step.id}`} className="order-1 w-full animate-apple-scale lg:order-2">
          {step.visual}
        </div>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between border-t border-zinc-200 pt-5 dark:border-zinc-800">
        {/* Back Button */}
        <div className="w-11">
          {currentStep > 0 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-500 shadow-sm transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
              aria-label="Previous step"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="h-11 w-11" />
          )}
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center gap-1.5" aria-label={`Step ${currentStep + 1} of ${STEPS.length}`}>
          {STEPS.map((s, index) => (
            <button
              type="button"
              key={s.id}
              onClick={() => setCurrentStep(index)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2",
                 index === currentStep
                  ? "w-8 bg-zinc-800 dark:bg-zinc-200"
                  : "w-2 bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-700 dark:hover:bg-zinc-600"
              )}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>

        {/* Action Button */}
        <div className="w-11 flex justify-end">
          <button
            type="button"
            onClick={handleNext}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg shadow-black/10 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            aria-label={currentStep === STEPS.length - 1 ? "Complete onboarding and continue to login" : "Next step"}
          >
            <ArrowRight className="w-4 h-4 stroke-[2]" />
          </button>
        </div>
      </footer>
    </div>
  );
}
