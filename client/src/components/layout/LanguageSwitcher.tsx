import i18next from "i18next";
import React from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LanguageSwitcherProps {
  variant?: "outline" | "ghost" | "default" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export default function LanguageSwitcher({
  variant = "outline",
  size = "sm",
  className = "",
}: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const currentLang = (i18n.language || "zh").startsWith("en") ? "en" : "zh";

  const handleToggle = () => {
    const nextLang = currentLang === "zh" ? "en" : "zh";
    i18n.changeLanguage(nextLang);
    localStorage.setItem("app_language", nextLang);
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleToggle}
      className={`flex items-center gap-1.5 font-mono text-xs cursor-pointer transition-all ${className}`}
      title={currentLang === "zh" ? "Switch to English" : "切换为中文"}
    >
      <Globe className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
      <span className="font-semibold">
        {currentLang === "zh" ? "EN / 中文" : "中文 / EN"}
      </span>
    </Button>
  );
}
