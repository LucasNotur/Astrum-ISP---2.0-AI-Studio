import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Skeleton } from "../Skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/src/lib/utils";

export function StatCard({ title, value, icon, trend, up, loading }: any) {
  return (
    <Card className="border-none shadow-sm dark:bg-zinc-900">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
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
              {trend} em relação ao mês anterior
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
