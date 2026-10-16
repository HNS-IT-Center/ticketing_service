import { useState, useEffect, useSyncExternalStore } from "react";

/**
 * Unsent form input, kept in the browser so it survives a reload.
 *
 * Staff were losing whole forms: Android discards a backgrounded Chrome tab
 * when the camera opens, an upload used to crash the page, a signal drop
 * reloads it. Each time the person typed everything again. Everything here is
 * per-device convenience — never a source of truth — so every storage access is
 * wrapped and a failure simply means "no draft".
 *
 * Files are not kept: a File cannot be put in localStorage. Forms that upload
 * ahead of submit (the create form) keep the uploaded URLs instead.
 */

const PREFIX = "hns-draft:";
const CHANGE_EVENT = "hns-draft-change";
/** A draft older than this is treated as abandoned. */
export const DRAFT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export type Draft<T> = { savedAt: number; data: T };

/**
 * Pure: parse a stored value, or null when absent, corrupt or — when `now` is
 * given — stale.
 */
export function parseDraft<T>(raw: string | null, now?: number): Draft<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Draft<T>;
    if (typeof parsed?.savedAt !== "number" || parsed.data === undefined) return null;
    if (now !== undefined && now - parsed.savedAt > DRAFT_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The stored string, or null when there is none worth offering. */
function readRaw(key: string): string | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return parseDraft(raw, Date.now()) ? raw : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable — nothing to clear */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Autosave `data` under `key` and report the draft found there.
 *
 * Nothing is written until the form differs from how it first rendered, so
 * merely opening a form never overwrites a draft the person may still want to
 * restore. `offer` is that earlier draft while the form is still untouched —
 * the moment to ask "restore?" — and null once they have started typing.
 */
export function useDraft<T>(key: string, data: T) {
  const json = JSON.stringify(data);
  const [pristine] = useState(json);
  // Set once the form has been sent: whatever the form resets itself to
  // afterwards must not be saved as a fresh draft.
  const [finished, setFinished] = useState(false);
  const dirty = json !== pristine;

  useEffect(() => {
    if (!dirty || finished) return;
    try {
      window.localStorage.setItem(
        PREFIX + key,
        JSON.stringify({ savedAt: Date.now(), data: JSON.parse(json) })
      );
    } catch {
      /* quota or private mode — the form still works, it just isn't kept */
    }
  }, [key, json, dirty, finished]);

  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  const offer = dirty ? null : parseDraft<T>(raw);

  return {
    offer,
    /** Throw the stored draft away; the form keeps autosaving. */
    discard: () => clearDraft(key),
    /** The form was sent: clear the draft and stop saving. */
    finish: () => {
      setFinished(true);
      clearDraft(key);
    },
  };
}
