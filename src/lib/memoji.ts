export const MEMOJI_LIST = [
  "/svgs/memoji/Frame 1000003460.svg",
  "/svgs/memoji/Frame 1000003461.svg",
  "/svgs/memoji/Frame 1000003462.svg",
  "/svgs/memoji/Frame 1000003463.svg",
  "/svgs/memoji/Frame 1000003464.svg",
  "/svgs/memoji/Frame 1000003465.svg",
  "/svgs/memoji/Frame 1000003466.svg",
  "/svgs/memoji/Frame 1000003467.svg",
  "/svgs/memoji/Frame 1000003468.svg",
  "/svgs/memoji/Frame 1000003469.svg",
  "/svgs/memoji/Frame 1000003470.svg",
  "/svgs/memoji/Frame 1000003471.svg",
  "/svgs/memoji/Frame 1000003472.svg",
  "/svgs/memoji/Frame 1000003473.svg",
  "/svgs/memoji/Frame 1000003474.svg",
  "/svgs/memoji/Frame 1000003475.svg",
];

/** Deterministically pick a memoji based on a wallet address */
export function getMemojiForAddress(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  }
  return MEMOJI_LIST[hash % MEMOJI_LIST.length];
}

/** Get a random memoji */
export function getRandomMemoji(): string {
  return MEMOJI_LIST[Math.floor(Math.random() * MEMOJI_LIST.length)];
}
