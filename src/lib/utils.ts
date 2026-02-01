import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import type { User } from "@prisma/client";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatName(name: string | undefined): string {
  if (!name) return "Anonymous User";
  if (name.startsWith("0x")) {
    return `${name.slice(0, 6)}...${name.slice(-4)}`;
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export function containsProfanity(text: string): boolean {
  return matcher.hasMatch(text);
}
