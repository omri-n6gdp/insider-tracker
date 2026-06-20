import { useLocation } from "react-router-dom";

/** Read a single URL query param without triggering re-renders on unrelated changes. */
export function useSearchParam(key: string): string | null {
  const { search } = useLocation();
  return new URLSearchParams(search).get(key);
}
