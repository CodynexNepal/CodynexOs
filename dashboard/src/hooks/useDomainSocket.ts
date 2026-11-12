"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { env } from "@/lib/env";

export function useDomainSocket(onEvent: (eventName: string, payload?: unknown) => void) {
  useEffect(() => {
    const socket = io(env.socketUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    const handleTask = (data?: unknown) => onEvent("task:updated", data);
    const handleNotif = (data?: unknown) => onEvent("notification:created", data);
    const handleStep = (data?: unknown) => onEvent("task:step", data);
    const handleActivity = (data?: unknown) => onEvent("agent:activity", data);
    const handleLog = (data?: unknown) => onEvent("task:log", data);
    const handlePreview = (data?: unknown) => onEvent("project:preview_ready", data);

    socket.on("task:updated", handleTask);
    socket.on("notification:created", handleNotif);
    socket.on("task:step", handleStep);
    socket.on("agent:activity", handleActivity);
    socket.on("task:log", handleLog);
    socket.on("project:preview_ready", handlePreview);

    return () => {
      socket.off("task:updated", handleTask);
      socket.off("notification:created", handleNotif);
      socket.off("task:step", handleStep);
      socket.off("agent:activity", handleActivity);
      socket.off("task:log", handleLog);
      socket.off("project:preview_ready", handlePreview);
      socket.disconnect();
    };
  }, [onEvent]);
}
