import React from "react";

export function RazorpayLogo({
  className = "h-7 w-auto",
  variant = "full",
}: {
  className?: string;
  variant?: "full" | "icon";
}) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`} aria-label="RazorReach Logo">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto aspect-square shrink-0"
      >
        <path d="M22.4 2.8L12.9 21.2H7.2L14.7 6.6H5.6L8.1 2.8H22.4Z" fill="#1177e4ff" />
        <path
          d="M14.7 6.6L12.1 11.7H6.7L9.3 6.6H14.7Z"
          fill="#0C2340"
          className="dark:fill-white/80"
        />
      </svg>
      {variant === "full" && (
        <span className="font-sans text-xl font-extrabold tracking-tight">
          <span className="text-[#02042B] dark:text-white">RazorReach</span>
        </span>
      )}
    </div>
  );
}
