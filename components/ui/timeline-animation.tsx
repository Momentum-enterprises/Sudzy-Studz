"use client";

import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

type TimelineContentProps = {
  as?: keyof typeof motion;
  animationNum?: number;
  timelineRef?: RefObject<HTMLElement | HTMLDivElement | null>;
  customVariants?: Variants;
  className?: string;
  children: ReactNode;
};

const defaultVariants: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.55, ease: "easeOut" },
  },
};

export function TimelineContent({
  as = "div",
  animationNum = 0,
  customVariants,
  className,
  children,
}: TimelineContentProps) {
  const localRef = useRef<HTMLElement | null>(null);
  const isInView = useInView(localRef, { once: true, margin: "-10% 0px" });
  const MotionTag = (motion as Record<string, any>)[as] || motion.div;

  return (
    <MotionTag
      ref={localRef}
      custom={animationNum}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={customVariants || defaultVariants}
      className={cn(className)}
    >
      {children}
    </MotionTag>
  );
}
