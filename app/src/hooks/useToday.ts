import { useEffect, useState } from "react";
import { today } from "../lib/dates";

/** Today's local date; updates after midnight and when the app returns to the foreground. */
export function useToday(): string {
  const [value, setValue] = useState(() => today());
  useEffect(() => {
    const update = () => setValue((prev) => {
      const next = today();
      return next === prev ? prev : next;
    });
    const id = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return value;
}
