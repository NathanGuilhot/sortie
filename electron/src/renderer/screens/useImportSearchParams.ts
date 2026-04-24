import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';

interface UseImportSearchParamsArgs {
  inputRef: RefObject<HTMLInputElement>;
  resultsLength: number;
  search(input: string): Promise<void>;
  reset(): void;
  storedQuery: string;
}

export function useImportSearchParams({
  inputRef,
  resultsLength,
  search,
  reset,
  storedQuery,
}: UseImportSearchParamsArgs) {
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get('q') ?? '';
  const [input, setInput] = useState(initialQuery || storedQuery);
  const lastDeeplinkedQuery = useRef<string | null>(null);

  useEffect(() => {
    if (!initialQuery) return;
    if (lastDeeplinkedQuery.current === initialQuery) return;
    if (storedQuery === initialQuery && resultsLength > 0) {
      lastDeeplinkedQuery.current = initialQuery;
      return;
    }

    lastDeeplinkedQuery.current = initialQuery;
    setInput(initialQuery);
    void search(initialQuery);
  }, [initialQuery, resultsLength, search, storedQuery]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setParams({ q: trimmed }, { replace: true });
    void search(trimmed);
  };

  const handleClear = () => {
    setInput('');
    reset();
    setParams({}, { replace: true });
    inputRef.current?.focus();
  };

  return {
    input,
    setInput,
    handleClear,
    handleSubmit,
  };
}
