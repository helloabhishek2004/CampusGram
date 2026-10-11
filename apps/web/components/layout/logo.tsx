import React from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@smart-campus/utils";

interface LogoProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "default" | "icon-only" | "emblem";
  format?: "svg" | "png";
  withLink?: boolean;
}

export function CampusGramLogo({
  className,
  size = "md",
  variant = "default",
  format = "svg",
  withLink = false,
}: LogoProps) {
  const sizeStyles = {
    xs: { box: "w-5 h-5 rounded-md", text: "text-xs", sub: "text-[8px]" },
    sm: { box: "w-6 h-6 rounded-md", text: "text-sm", sub: "text-[9px]" },
    md: { box: "w-7 h-7 rounded-lg", text: "text-sm", sub: "text-[10px]" },
    lg: { box: "w-9 h-9 rounded-xl", text: "text-base", sub: "text-xs" },
    xl: { box: "w-12 h-12 rounded-2xl", text: "text-xl", sub: "text-xs" },
  }[size];

  const iconSrc =
    variant === "emblem"
      ? format === "png"
        ? "/assets/campus_gram_logo.png"
        : "/assets/campus_gram_logo.svg"
      : format === "png"
      ? "/assets/campus_gram_icon.png"
      : "/assets/campus_gram_icon.svg";

  const content = (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <div
        className={cn(
          "relative overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center shadow-xs shrink-0",
          sizeStyles.box
        )}
      >
        <Image
          src={iconSrc}
          alt="CampusGram Icon"
          width={48}
          height={48}
          className="w-full h-full object-cover"
        />
      </div>

      {variant !== "icon-only" && (
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              "font-semibold tracking-tight text-zinc-900 dark:text-zinc-100",
              sizeStyles.text
            )}
          >
            CampusGram
          </span>
          <span
            className={cn(
              "text-zinc-500 font-mono tracking-wider uppercase mt-0.5",
              sizeStyles.sub
            )}
          >
            Smart Campus
          </span>
        </div>
      )}
    </div>
  );

  if (withLink) {
    return (
      <Link
        href="/home"
        className="focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 rounded-lg inline-flex"
      >
        {content}
      </Link>
    );
  }

  return content;
}

export function CampusGramIcon({
  size = "md",
  className,
  format = "svg",
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  format?: "svg" | "png";
}) {
  return (
    <CampusGramLogo
      size={size}
      variant="icon-only"
      format={format}
      className={className}
    />
  );
}
