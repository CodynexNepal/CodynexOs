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

    // Browser automation events
    socket.on("browser:navigation", trigger("browser:navigation"));
    socket.on("browser:screenshot", trigger("browser:screenshot"));
    socket.on("browser:action", trigger("browser:action"));
    socket.on("browser:error", trigger("browser:error"));

    // Terminal execution events
    socket.on("terminal:start", trigger("terminal:start"));
    socket.on("terminal:output", trigger("terminal:output"));
    socket.on("terminal:exit", trigger("terminal:exit"));

    // Autonomous Agent Lifecycle & Tool events
    socket.on("agent:lifecycle", trigger("agent:lifecycle"));
    socket.on("agent:thinking", trigger("agent:thinking"));
    socket.on("agent:tool_started", trigger("agent:tool_started"));
    socket.on("agent:tool_completed", trigger("agent:tool_completed"));

    // Live file streaming events
    socket.on("file:edit:start", trigger("file:edit:start"));
    socket.on("file:stream", trigger("file:stream"));
    socket.on("file:edit:complete", trigger("file:edit:complete"));
    socket.on("workspace:status", trigger("workspace:status"));

    // QA Release Gates & Scorecard events
    socket.on("qa:pipeline_started", trigger("qa:pipeline_started"));
    socket.on("qa:gate_evaluated", trigger("qa:gate_evaluated"));
    socket.on("qa:release_certificate", trigger("qa:release_certificate"));

    return () => {
      socket.disconnect();
    };
  }, []);
}
