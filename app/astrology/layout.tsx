"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AstrologyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navItems = [
    { name: "紫微斗数", path: "/astrology/ziwei" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <div className="py-4 bg-muted">
        <div className="container mx-auto">
          <h1 className="text-2xl font-bold mb-2">命理工具</h1>
          <nav className="flex space-x-4">
            {navItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                  pathname === item.path
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted-foreground/10"
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <main className="flex-1 pb-10">
        {children}
      </main>
    </div>
  );
} 