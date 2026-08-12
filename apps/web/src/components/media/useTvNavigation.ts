"use client";

import { useEffect } from "react";

export function useTvNavigation() {
  useEffect(() => {
    function focusFirst() {
      const first = document.querySelector<HTMLElement>("[data-focusable='true']");
      if (first && !document.activeElement?.matches("input, video")) first.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" || event.key === "Backspace") {
        if (document.activeElement?.matches("input")) (document.activeElement as HTMLElement).blur();
        else history.back();
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const active = document.activeElement as HTMLElement | null;
      if (!active?.dataset.focusable || active.matches("input")) return;
      const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-focusable='true']:not([disabled])"));
      const rect = active.getBoundingClientRect();
      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height / 2;
      const candidates = elements.filter((element) => {
        if (element === active) return false;
        const next = element.getBoundingClientRect();
        const x = next.left + next.width / 2;
        const y = next.top + next.height / 2;
        if (event.key === "ArrowLeft") return x < originX - 8;
        if (event.key === "ArrowRight") return x > originX + 8;
        if (event.key === "ArrowUp") return y < originY - 8;
        return y > originY + 8;
      });
      const next = candidates.sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const ax = ar.left + ar.width / 2 - originX;
        const ay = ar.top + ar.height / 2 - originY;
        const bx = br.left + br.width / 2 - originX;
        const by = br.top + br.height / 2 - originY;
        const aPrimary = event.key.includes("Left") || event.key.includes("Right") ? Math.abs(ax) : Math.abs(ay);
        const bPrimary = event.key.includes("Left") || event.key.includes("Right") ? Math.abs(bx) : Math.abs(by);
        const aSecondary = event.key.includes("Left") || event.key.includes("Right") ? Math.abs(ay) : Math.abs(ax);
        const bSecondary = event.key.includes("Left") || event.key.includes("Right") ? Math.abs(by) : Math.abs(bx);
        return aPrimary + aSecondary * 2 - (bPrimary + bSecondary * 2);
      })[0];
      if (next) {
        event.preventDefault();
        next.focus({ preventScroll: true });
        next.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(focusFirst, 80);
    return () => { window.removeEventListener("keydown", onKeyDown); window.clearTimeout(timer); };
  }, []);
}
