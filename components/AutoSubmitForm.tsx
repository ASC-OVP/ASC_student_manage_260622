"use client";

import { useEffect, useRef } from "react";

export default function AutoSubmitForm() {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = markerRef.current?.closest("form");
    if (!form) return;
    const targetForm = form;

    let lastFocusedValue = "";

    function submitForm() {
      if (targetForm.dataset.submitting === "true") return;
      targetForm.dataset.submitting = "true";
      targetForm.requestSubmit();
      window.setTimeout(() => {
        delete targetForm.dataset.submitting;
      }, 1200);
    }

    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type !== "hidden") {
        lastFocusedValue = target.value;
      }
    }

    function onFocusOut(event: FocusEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type !== "hidden" && target.value !== lastFocusedValue) {
        submitForm();
      }
    }

    function onChange(event: Event) {
      if (event.target instanceof HTMLSelectElement) submitForm();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type !== "hidden") {
        event.preventDefault();
        submitForm();
      }
    }

    targetForm.addEventListener("focusin", onFocusIn);
    targetForm.addEventListener("focusout", onFocusOut);
    targetForm.addEventListener("change", onChange);
    targetForm.addEventListener("keydown", onKeyDown);

    return () => {
      targetForm.removeEventListener("focusin", onFocusIn);
      targetForm.removeEventListener("focusout", onFocusOut);
      targetForm.removeEventListener("change", onChange);
      targetForm.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return <span ref={markerRef} hidden />;
}
