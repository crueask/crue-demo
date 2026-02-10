"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  History,
  Settings,
} from "lucide-react";

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Reports", href: "/dashboard/reports", icon: FileText },
];

const secondaryNavigation = [
  { name: "Samtalehistorikk", href: "/dashboard/chat/history", icon: History },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

interface SidebarProps {
  mobile?: boolean;
}

export function Sidebar({ mobile = false }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={mobile ? "flex h-full w-full flex-col" : "hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col"}>
      <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-border/50 bg-sidebar px-6 pb-4">
        <div className="flex h-16 shrink-0 items-center">
          <Link href="/dashboard" className="flex items-center gap-2">
            <svg className="h-8 w-8" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M91 192C87.25 170.5 72 143.5 43 121.75C28.75 111 14.25 104 0 101V90.5C28.25 83.75 56 64.75 73.75 39C82.75 26 88.5 13.25 91 0H101.5C105.75 25.25 125.25 53.25 151.75 72C164.75 81.25 178.25 87.5 192 90.5V101C164.25 106.75 132 131.5 116 156.75C108 169.5 103.25 181.25 101.5 192H91Z" fill="#D2D2FF"/>
            </svg>
            <span className="font-serif font-semibold text-xl">CRUE</span>
          </Link>
        </div>
        <nav className="flex flex-1 flex-col">
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            <li>
              <ul role="list" className="-mx-2 space-y-1">
                {navigation.map((item) => {
                  const isActive = item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex gap-x-3 rounded-lg p-2.5 text-sm font-medium leading-6 transition-all duration-200",
                          isActive
                            ? "bg-accent/80 text-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-5 w-5 shrink-0 transition-colors duration-200",
                            isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
            <li className="mt-auto">
              <ul role="list" className="-mx-2 space-y-1">
                {secondaryNavigation.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex gap-x-3 rounded-lg p-2.5 text-sm font-medium leading-6 transition-all duration-200",
                          isActive
                            ? "bg-accent/80 text-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-5 w-5 shrink-0 transition-colors duration-200",
                            isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          </ul>
        </nav>
      </div>
    </aside>
  );
}
