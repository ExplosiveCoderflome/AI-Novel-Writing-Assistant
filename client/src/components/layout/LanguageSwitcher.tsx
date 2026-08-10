import React from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
}

interface LanguageSwitcherProps {
  variant?: "outline" | "ghost" | "default" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export default function LanguageSwitcher({
  className = "",
}: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language || "zh").startsWith("en") ? "en" : "zh";

  const supportedLanguages: LanguageOption[] = [
    { code: "zh", label: "简体中文", nativeLabel: "简体中文" },
    { code: "en", label: "English", nativeLabel: "English" },
  ];

  const handleLanguageChange = (newLang: string) => {
    i18n.changeLanguage(newLang);
    localStorage.setItem("app_language", newLang);
  };

  const currentOption = supportedLanguages.find((l) => l.code === currentLang) ?? supportedLanguages[0];

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <Select value={currentLang} onValueChange={handleLanguageChange}>
        <SelectTrigger className="h-8 gap-1.5 border-slate-700/80 bg-slate-800/80 px-2.5 text-xs text-slate-100 shadow-none hover:border-slate-600 hover:bg-slate-800 focus:ring-1 focus:ring-sky-500/50">
          <Globe className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          <SelectValue placeholder={t("dict.language", "语言")}>
            {currentOption.nativeLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="end" className="min-w-[9rem] border-slate-700 bg-slate-900 text-slate-100 shadow-lg">
          {supportedLanguages.map((lang) => (
            <SelectItem
              key={lang.code}
              value={lang.code}
              className="text-xs cursor-pointer focus:bg-slate-800 focus:text-white"
            >
              <div className="flex items-center justify-between gap-3 w-full">
                <span>{lang.nativeLabel}</span>
                <span className="text-[10px] text-slate-400 uppercase font-mono">{lang.code}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
