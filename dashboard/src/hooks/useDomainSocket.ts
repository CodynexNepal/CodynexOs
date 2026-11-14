"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { env } from "@/lib/env";

export function useDomainSocket(onEvent: (eventName: string, payload?: unknown) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const socket: Socket = io(env.socketUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });

    const trigger = (eventName: string) => (data?: unknown) => {
      handlerRef.current?.(eventName, data);
    };

    socket.on("task:updated", trigger("task:updated"));
    socket.on("task:step", trigger("task:step"));
    socket.on("agent:activity", trigger("agent:activity"));
    socket.on("task:log", trigger("task:log"));
    socket.on("notification:created", trigger("notification:created"));
    socket.on("notification:read", trigger("notification:read"));
    socket.on("notification:all_read", trigger("notification:all_read"));
    socket.on("approval:reviewed", trigger("approval:reviewed"));
    socket.on("project:preview_ready", trigger("project:preview_ready"));

    return () => {
      socket.disconnect();
    };
  }, []);
}
