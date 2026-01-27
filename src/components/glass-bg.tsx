"use client";

import React from "react";

interface GlassBgProps {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    height?: string | number; // total outer height
    minWidth?: string | number; // minimum width before flex grows
    glow?: boolean; // toggle blurred glow shadow
    strokeWidth?: number; // allow tweaking stroke width
}

// GlassButton now renders an inline SVG pill border (adapted from btn-bg.svg) without hardcoded label paths.
// The SVG scales to the provided height while preserving aspect ratio; width is auto via flex/minWidth.
// Children are layered above the SVG. Optional glow uses the original Gaussian blur filter region.
export function GlassBg({
    children,
    onClick,
    className = "",
    height = 54,
    minWidth = 200,
    glow = true,
    strokeWidth = 0.8,
}: GlassBgProps) {
    const heightValue = typeof height === "number" ? `${height}px` : height;
    const minWidthValue = typeof minWidth === "number" ? `${minWidth}px` : minWidth;

    // Base intrinsic SVG dimensions from original asset
    const intrinsicWidth = 230;
    const intrinsicHeight = 60;
    const aspectRatio = intrinsicWidth / intrinsicHeight;

    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                height: heightValue,
                minWidth: minWidthValue,
            }}
            className={`group relative inline-flex items-center justify-start rounded-full text-sm tracking-wide text-white ${className}`}
        >
            {/* Decorative SVG border/background */}
            <svg
                aria-hidden="true"
                focusable="false"
                className="absolute inset-0 w-full h-full"
                viewBox={`0 0 ${intrinsicWidth} ${intrinsicHeight}`}
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <linearGradient id="gb_paint_outer" x1="190.44" y1="0" x2="184.022" y2="36.1671" gradientUnits="userSpaceOnUse">
                        <stop stopColor="white" />
                        <stop offset="1" stopColor="white" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="gb_paint_inner" x1="420.44" y1="60" x2="414.022" y2="96.1671" gradientUnits="userSpaceOnUse">
                        <stop stopColor="white" />
                        <stop offset="1" stopColor="white" stopOpacity="0" />
                    </linearGradient>
                    {glow && (
                        <filter id="gb_glow" x="5" y="20" width="220" height="89" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                            <feFlood floodOpacity="0" result="BackgroundImageFix" />
                            <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                            <feGaussianBlur stdDeviation="20" result="effect1_foregroundBlur" />
                        </filter>
                    )}
                    <clipPath id="gb_clip">
                        <rect width={intrinsicWidth} height={intrinsicHeight} rx={intrinsicHeight / 2} />
                    </clipPath>
                </defs>
                {/* Inner stroke (mirroring rotated rect of original) */}
                <rect
                    x={intrinsicWidth - 0.4}
                    y={intrinsicHeight - 0.4}
                    width={intrinsicWidth - 0.8}
                    height={intrinsicHeight - 0.8}
                    rx={(intrinsicHeight - 0.8) / 2}
                    transform={`rotate(180 ${intrinsicWidth - 0.4} ${intrinsicHeight - 0.4})`}
                    stroke="url(#gb_paint_inner)"
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                {/* Optional blurred glow rectangle underneath */}
                {glow && (
                    <g filter="url(#gb_glow)" clipPath="url(#gb_clip)">
                        <path
                            d={`M45 ${intrinsicHeight + 9}C45 ${intrinsicHeight + 4.029} 49.029 ${intrinsicHeight} 54 ${intrinsicHeight}H${intrinsicWidth - 54}C${intrinsicWidth - 49.029} ${intrinsicHeight} ${intrinsicWidth - 45} ${intrinsicHeight + 4.029} ${intrinsicWidth - 45} ${intrinsicHeight + 9}H45Z`}
                            fill="white"
                            opacity={0.9}
                        />
                    </g>
                )}
                {/* Outer stroke */}
                <rect
                    x={0.4}
                    y={0.4}
                    width={intrinsicWidth - 0.8}
                    height={intrinsicHeight - 0.8}
                    rx={(intrinsicHeight - 0.8) / 2}
                    stroke="url(#gb_paint_outer)"
                    strokeWidth={strokeWidth}
                    fill="none"
                />
            </svg>
            <span className="relative z-10 select-none">
                {children}
            </span>
        </button>
    );
}

