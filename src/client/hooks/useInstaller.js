import { useCallback, useMemo, useState } from "react";
import { api } from "../lib/api";

export function useInstaller(onInstalled) {
  const [open, setOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [ghStatus, setGhStatus] = useState(null);
  const [ghStatusLoading, setGhStatusLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const fetchGhStatus = useCallback(async () => {
    setGhStatusLoading(true);
    try {
      const result = await api("/api/installer/gh-status");
      setGhStatus(result);
    } catch {
      setGhStatus({ authenticated: false });
    } finally {
      setGhStatusLoading(false);
    }
  }, []);

  const scan = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/installer/scan", {
        method: "POST",
        body: JSON.stringify({ repoUrl })
      });
      const scanned = result.items || [];
      setItems(scanned);
      if (scanned.length === 0) {
        const diag = Array.isArray(result.diagnostics) ? result.diagnostics.join(" | ") : "";
        setError(`Scan finished but found 0 items.${diag ? ` ${diag}` : ""}`);
      }
      setSelectedKeys(new Set(scanned.map((it) => `${it.type}:${it.id}:${it.relPath}`)));
      setScanOpen(false);
      setOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [repoUrl]);

  const openScan = useCallback(() => {
    setError("");
    setScanOpen(true);
    fetchGhStatus();
  }, [fetchGhStatus]);

  const grouped = useMemo(() => {
    const hasPlugins = items.some((i) => i.pluginId);
    if (!hasPlugins) {
      const data = { skills: [], agents: [], mcp: [], hooks: [], plugins: [] };
      for (const item of items) data[item.type]?.push(item);
      return { mode: "flat", data };
    }
    const pluginMap = new Map();
    const orphans = { skills: [], agents: [], mcp: [], hooks: [], plugins: [] };
    for (const item of items) {
      if (item.pluginId) {
        if (!pluginMap.has(item.pluginId)) pluginMap.set(item.pluginId, []);
        pluginMap.get(item.pluginId).push(item);
      } else {
        orphans[item.type]?.push(item);
      }
    }
    const plugins = [...pluginMap.entries()].map(([id, pluginItems]) => ({ id, items: pluginItems }));
    return { mode: "plugin", plugins, orphans };
  }, [items]);

  const toggleItem = useCallback((item) => {
    const key = `${item.type}:${item.id}:${item.relPath}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleCategory = useCallback((category, enabled) => {
    const categoryItems = items.filter((item) => item.type === category);
    const categoryKeys = categoryItems.map((item) => `${item.type}:${item.id}:${item.relPath}`);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const key of categoryKeys) {
        if (enabled) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }, [items]);

  const togglePlugin = useCallback((pluginId, enabled, explicitKeys) => {
    const keys = explicitKeys ?? items.filter((i) => i.pluginId === pluginId).map((i) => `${i.type}:${i.id}:${i.relPath}`);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (enabled) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }, [items]);

  const toggleAll = useCallback((enabled) => {
    if (enabled) {
      setSelectedKeys(new Set(items.map((i) => `${i.type}:${i.id}:${i.relPath}`)));
    } else {
      setSelectedKeys(new Set());
    }
  }, [items]);

  const setAllItemTypes = useCallback((type) => {
    setItems((prev) => prev.map((it) =>
      (it.type === "agents" || it.type === "skills") ? { ...it, type } : it
    ));
    setSelectedKeys((prev) => {
      const next = new Set();
      for (const key of prev) {
        const parts = key.split(":");
        const itemType = parts[0];
        if (itemType === "agents" || itemType === "skills") {
          next.add([type, ...parts.slice(1)].join(":"));
        } else {
          next.add(key);
        }
      }
      return next;
    });
  }, []);

  const setItemType = useCallback((item, type) => {
    const oldKey = `${item.type}:${item.id}:${item.relPath}`;
    const newKey = `${type}:${item.id}:${item.relPath}`;
    setItems((prev) => prev.map((it) =>
      it.type === item.type && it.id === item.id && it.relPath === item.relPath
        ? { ...it, type }
        : it
    ));
    setSelectedKeys((prev) => {
      if (!prev.has(oldKey)) return prev;
      const next = new Set(prev);
      next.delete(oldKey);
      next.add(newKey);
      return next;
    });
  }, []);

  const install = useCallback(async () => {
    setBusy(true);
    setError("");
    setProgress({ done: 0, total: 0 });
    try {
      const selected = items.filter((item) => selectedKeys.has(`${item.type}:${item.id}:${item.relPath}`));
      const res = await fetch("/api/installer/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, items: selected })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${res.status}`);
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
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          let event;
          try { event = JSON.parse(dataLine.slice(6)); } catch { continue; }
          if (event.type === "progress") {
            setProgress({ done: event.done, total: event.total });
          } else if (event.type === "done") {
            setOpen(false);
            setItems([]);
            setSelectedKeys(new Set());
            setProgress({ done: 0, total: 0 });
            onInstalled?.();
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [items, onInstalled, repoUrl, selectedKeys]);

  return {
    open,
    setOpen,
    scanOpen,
    setScanOpen,
    busy,
    error,
    repoUrl,
    setRepoUrl,
    ghStatus,
    ghStatusLoading,
    items,
    grouped,
    selectedKeys,
    scan,
    toggleItem,
    toggleCategory,
    togglePlugin,
    toggleAll,
    setItemType,
    setAllItemTypes,
    install,
    openScan,
    progress
  };
}
