import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

export function usePluginsState() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pluginsState, setPluginsState] = useState(null);
  const [pluginModal, setPluginModal] = useState(null);
  const [pluginModalContent, setPluginModalContent] = useState("");
  const [pluginContents, setPluginContents] = useState(null);
  const [preview, setPreview] = useState(null);

  const loadPlugins = useCallback(async () => {
    setBusy(true);
    try {
      const state = await api("/api/plugins/state");
      setPluginsState(state);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const openPluginModal = useCallback(async (pluginId) => {
    setBusy(true);
    try {
      const [state, manifest, contents] = await Promise.all([
        pluginsState ? Promise.resolve(pluginsState) : api("/api/plugins/state"),
        api(`/api/plugins/manifest?pluginId=${encodeURIComponent(pluginId)}`),
        api(`/api/plugins/contents?pluginId=${encodeURIComponent(pluginId)}`).catch(() => null)
      ]);
      const plugin = (state.plugins || []).find((p) => p.id === pluginId);
      if (!plugin) throw new Error("Plugin not found");
      setPluginModal({ ...plugin, manifestPath: manifest.path, originalContent: manifest.content || "" });
      setPluginModalContent(manifest.content || "");
      setPluginContents(contents);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, [pluginsState]);

  const savePluginModal = useCallback(async () => {
    if (!pluginModal) return;
    setBusy(true);
    try {
      await api("/api/plugins/manifest", {
        method: "PUT",
        body: JSON.stringify({ pluginId: pluginModal.id, content: pluginModalContent })
      });
      setPluginModal((prev) => prev ? { ...prev, originalContent: pluginModalContent } : prev);
      await loadPlugins();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, [loadPlugins, pluginModal, pluginModalContent]);

  const createNewPlugin = useCallback(async (pluginId) => {
    setBusy(true);
    try {
      await api("/api/plugins/create", {
        method: "POST",
        body: JSON.stringify({ pluginId })
      });
      await loadPlugins();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, [loadPlugins]);

  const deleteExistingPlugin = useCallback(async (pluginId) => {
    setBusy(true);
    try {
      await api("/api/plugins", {
        method: "DELETE",
        body: JSON.stringify({ pluginId })
      });
      if (pluginModal?.id === pluginId) setPluginModal(null);
      await loadPlugins();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, [loadPlugins, pluginModal]);
  const syncPlugins = useCallback(async () => {
    setBusy(true);
    try {
      await api("/api/plugins/sync", { method: "POST", body: JSON.stringify({}) });
      await loadPlugins();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, [loadPlugins]);

  const previewSync = useCallback(async () => {
    setBusy(true);
    try {
      const result = await api("/api/plugins/preview-sync");
      setPreview(result);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    busy,
    message,
    pluginsState,
    loadPlugins,
    syncPlugins,
    createNewPlugin,
    deleteExistingPlugin,
    pluginModal,
    setPluginModal,
    pluginModalContent,
    setPluginModalContent,
    pluginContents,
    openPluginModal,
    savePluginModal,
    preview,
    previewSync
  };
}
