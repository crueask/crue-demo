import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: LucideIcon;
  description?: string;
}

export function StatCard({ title, value, change, icon: Icon, description }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-label">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-display-sm text-foreground">{value}</div>
        {(change !== undefined || description) && (
          <p className="text-xs text-muted-foreground mt-1">
            {change !== undefined && (
              <span
                className={cn(
                  "font-medium",
                  change >= 0 ? "text-foreground" : "text-destructive"
                )}
              >
                {change >= 0 ? "+" : ""}
                {change}%{" "}
              </span>
            )}
            {description || "from last period"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
