"use client";

import { useEffect } from "react";
import { BASE_PATH } from "@/lib/basePath";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${BASE_PATH}/sw.js`).catch(() => {
        // Installability degrades gracefully without the service worker.
      });
    }
  }, []);
  return null;
}
