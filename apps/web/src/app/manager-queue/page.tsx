"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ManagerQueuePage() {
  const router = useRouter();
  useEffect(() => { router.replace("/leads"); }, [router]);
  return null;
}
