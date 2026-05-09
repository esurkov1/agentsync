import { useCallback, useMemo, useState } from "react";

export function useSkillsShInstaller(onInstalled) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null); // null = not searched yet
  const [resultCount, setResultCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [query, setQuery] = useState("");

  const openModal = useCallback(() => {
    setOpen(true);
    setError("");
    setQuery("");
    setResults(null);
    setResultCount(0);
    setSelectedIds(new Set());
    setProgress({ done: 0, total: 0 });
  }, []);

  const closeModal = useCallback(() => {
    if (busy) return;
    setOpen(false);
  }, [busy]);

  const search = useCallback(async (q) => {
    setSearching(true);
    setError("");
    setResults(null);
    setResultCount(0);
    setSelectedIds(new Set());
    try {
      const url = `/api/installer/skillssh/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "?q="}`;
      const res = await fetch(url);
      const data = await res.json();
      setResults(Array.isArray(data.items) ? data.items : []);
      setResultCount(data.count ?? 0);
      if (data.error) setError(data.error);
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const toggleItem = useCallback((item) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((items, enabled) => {
    setSelectedIds(enabled ? new Set(items.map((i) => i.id)) : new Set());
  }, []);

  const install = useCallback(async () => {
    if (!results) return;
    const selected = results.filter((i) => selectedIds.has(i.id));
    if (!selected.length) return;
    setBusy(true);
    setError("");
    setProgress({ done: 0, total: 0 });
    try {
      const res = await fetch("/api/installer/skillssh/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selected })
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.type === "progress") setProgress({ done: event.done, total: event.total });
          else if (event.type === "done") { setOpen(false); setResults(null); setSelectedIds(new Set()); onInstalled?.(); }
          else if (event.type === "error") throw new Error(event.message);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setProgress({ done: 0, total: 0 });
    }
  }, [results, selectedIds, onInstalled]);

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  return {
    open, busy, searching, error,
    results, resultCount, selectedIds, selectedCount,
    progress, query, setQuery,
    openModal, closeModal,
    search, toggleItem, toggleAll, install
  };
}
