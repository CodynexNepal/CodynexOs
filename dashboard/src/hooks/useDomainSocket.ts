"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { env } from "@/lib/env";

export function useDomainSocket(onEvent: (eventName: string) => void) {
  useEffect(() => {
    const socket = io(env.socketUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    const handleTask = () => onEvent("task:updated");
    const handleNotif = () => onEvent("notification:created");

    socket.on("task:updated", handleTask);
    socket.on("notification:created", handleNotif);

    return () => {
      socket.off("task:updated", handleTask);
      socket.off("notification:created", handleNotif);
      socket.disconnect();
    };
  }, [onEvent]);
}
