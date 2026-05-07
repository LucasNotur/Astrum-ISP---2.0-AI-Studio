import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Skeleton } from "../Skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/src/lib/utils";

export function StatCard({ title, value, icon, trend, up, loading }: any) {
  return (
    <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] dark:bg-zinc-900/60 dark:backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:shadow-md dark:hover:bg-zinc-900/80">
      <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
      <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
        <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</CardTitle>
        <div className="p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
          {icon}
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold dark:text-zinc-50">{value}</div>
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium mt-1",
              up ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            )}>
              {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trend} <span className="hidden sm:inline">em relação ao mês anterior</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
