"use client";

import React from "react";
import { useCampusAuth } from "../auth/auth-guard";
import { IdentityCard } from "../auth/identity-card";
import { LogOut, ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export function ProfileSummary() {
  const { user, logout, switchDemoUser } = useCampusAuth();

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-sm shrink-0">
            <Image
              src="/assets/campus_gram_icon.svg"
              alt="CampusGram"
              width={44}
              height={44}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Institutional Profile
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Canonical identity verified via university registrar directory.
            </p>
          </div>
        </div>

        <Link
          href="/home"
          className="text-xs font-medium text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Home</span>
        </Link>
      </div>

      {/* Grouped Profile Sections */}
      <IdentityCard
        profile={user}
        variant="profile"
        footerAction={
          <div className="pt-2">
            <button
              onClick={logout}
              className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-zinc-500" />
              <span>Sign Out of CampusGram</span>
            </button>
          </div>
        }
      />

      {/* Quick Persona Switcher for Hackathon Testing */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
            <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-medium">
              Demo Persona Switcher
            </h4>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">Fast Role Testing</span>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Switch active identities to inspect student versus faculty versus department head role views:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <button
            onClick={() => switchDemoUser("STU2026001")}
            className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 text-left transition-colors text-xs space-y-0.5"
          >
            <p className="font-medium text-emerald-400">Student</p>
            <p className="text-[11px] text-zinc-400 font-mono">Aarav Sharma</p>
            <p className="text-[10px] text-zinc-500 font-mono">STU2026001</p>
          </button>

          <button
            onClick={() => switchDemoUser("FAC1001")}
            className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 text-left transition-colors text-xs space-y-0.5"
          >
            <p className="font-medium text-zinc-200">Faculty</p>
            <p className="text-[11px] text-zinc-400 font-mono">Dr. Sundar Pichai</p>
            <p className="text-[10px] text-zinc-500 font-mono">FAC1001</p>
          </button>

          <button
            onClick={() => switchDemoUser("FAC1011")}
            className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 text-left transition-colors text-xs space-y-0.5"
          >
            <p className="font-medium text-zinc-200">HOD (CSE)</p>
            <p className="text-[11px] text-zinc-400 font-mono">Dr. Aris Thorne</p>
            <p className="text-[10px] text-zinc-500 font-mono">FAC1011</p>
          </button>
        </div>
      </div>
    </div>
  );
}
