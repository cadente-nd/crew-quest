"use client";
import { theme } from "@/theme/tokens";

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }
) {
  const { variant = "primary", style, ...rest } = props;
  return (
    <button
      {...rest}
      style={{
        width: "100%",
        padding: "16px",
        fontSize: 18,
        fontWeight: 700,
        borderRadius: theme.radius,
        border: "none",
        cursor: "pointer",
        color: variant === "primary" ? "#fff" : "#1A1A2E",
        background: variant === "primary" ? theme.gradients.party : "#EEE",
        ...style,
      }}
    />
  );
}
