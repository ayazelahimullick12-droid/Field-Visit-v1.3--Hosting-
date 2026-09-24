import React from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      aria-label="Toggle dark mode"
    >
      {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
