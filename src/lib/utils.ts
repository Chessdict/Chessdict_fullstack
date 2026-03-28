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

export function formatWalletAddress(address: string | null | undefined): string {
  if (!address) return "Unknown";
  if (!address.startsWith("0x")) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatName(name: string | undefined): string {
  if (!name) return "Anonymous User";
  if (name.startsWith("0x")) {
    return formatWalletAddress(name);
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

export function getDisplayName(
  username: string | null | undefined,
  walletAddress: string | null | undefined,
  fallback = "Anonymous User",
) {
  const normalizedUsername = username?.trim();
  if (normalizedUsername) return normalizedUsername;
  if (walletAddress) return formatWalletAddress(walletAddress);
  return fallback;
}

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export function containsProfanity(text: string): boolean {
  return matcher.hasMatch(text);
}
