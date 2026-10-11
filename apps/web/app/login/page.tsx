"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CollegeIdForm } from "@/components/auth/college-id-form";
import { useCampusAuth } from "@/components/auth/auth-guard";
import { ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const { user, loading } = useCampusAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [user, loading, router]);

  return (
    <div className="relative flex min-h-screen min-h-[100svh] overflow-hidden bg-zinc-50 px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:px-10 lg:px-14">
      {/* Background Ambient Branding Watermark */}
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -right-16 w-96 h-96 opacity-[0.03] dark:opacity-[0.07] select-none">
        <Image
          src="/assets/campus_gram_logo.svg"
          alt=""
          width={384}
          height={384}
          className="w-full h-full object-contain"
        />
      </div>

      <main className="relative z-10 m-auto grid w-full max-w-6xl items-center gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] lg:gap-24">
        <div className="max-w-xl space-y-5 text-center animate-apple-in lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <Image
              src="/assets/campus_gram_icon.svg"
              alt="CampusGram"
              width={14}
              height={14}
              className="w-3.5 h-3.5 rounded-xs"
            />
            <span>CampusGram</span>
          </div>

          <div className="flex items-center justify-center lg:justify-start pt-1">
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-md">
              <Image
                src="/assets/campus_gram_icon.svg"
                alt="CampusGram Logo"
                width={56}
                height={56}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-zinc-950 dark:text-zinc-100 sm:text-5xl lg:text-6xl lg:leading-[1.05]">
            Your campus, clearly connected.
          </h1>
          <p className="max-w-md text-base leading-7 text-zinc-600 dark:text-zinc-400 sm:text-lg">
            Sign in with your institutional identity to continue to the calm, verified campus workspace.
          </p>
        </div>

        <section className="w-full max-w-md justify-self-center rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.18)] animate-apple-scale dark:border-zinc-800 dark:bg-zinc-900 sm:p-8 lg:justify-self-end">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
                Institutional access
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Use your official university ID to continue.
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 p-1 shadow-xs shrink-0 flex items-center justify-center">
              <Image
                src="/assets/campus_gram_logo.png"
                alt="CampusGram Emblem"
                width={32}
                height={32}
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          <CollegeIdForm />
        </section>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-5 left-0 right-0 z-10 px-5 text-center sm:bottom-8">
        <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <ShieldCheck className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
          <span>Verified against institutional directory records</span>
        </p>
      </footer>
    </div>
  );
}
