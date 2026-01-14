"use client";

import { Loader2 } from "lucide-react";
import { useMemo } from "react";

const norwegianPuns = [
  "Holder av plassen din...",
  "Teller billetter...",
  "Sjekker om det er utsolgt...",
  "Finner de beste plassene...",
  "Varmer opp konsertskoa...",
  "Pusser scenegulvet...",
  "Tuner gitarene...",
  "Mikser lyden...",
  "Setter opp lyset...",
  "Åpner dørene snart...",
  "Rister på hoftene...",
  "Sjekker backstage-passet...",
];

export function LoadingSpinner() {
  const pun = useMemo(() => {
    return norwegianPuns[Math.floor(Math.random() * norwegianPuns.length)];
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 text-lg text-muted-foreground">{pun}</p>
    </div>
  );
}
