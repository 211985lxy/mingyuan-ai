"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { getVideoTask } from "@/lib/api/client";

export function useVideoTaskPolling(
  taskId: string | null,
  taskStatus: string | null,
  setTaskStatus: Dispatch<SetStateAction<string | null>>,
  setTaskError: Dispatch<SetStateAction<string | null>>,
) {
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!taskId || taskStatus === "completed" || taskStatus === "failed") return;
    const interval = taskStatus === "queued" ? 10000 : 3000;
    pollRef.current = setInterval(async () => {
      try {
        const task = await getVideoTask(taskId);
        setTaskStatus(task.status);
        if (task.status === "completed") {
          if (pollRef.current) clearInterval(pollRef.current);
          router.push(`/videos/${task.id}`);
        }
        if (task.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setTaskError(task.errorMessage ?? "生成失败，请重试");
        }
      } catch {
        // Keep polling transient network failures.
      }
    }, interval);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [router, setTaskError, setTaskStatus, taskId, taskStatus]);
}
