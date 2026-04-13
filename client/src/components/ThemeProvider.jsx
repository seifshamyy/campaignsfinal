import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getStoredSlug } from "../lib/api.js";

const ConfigContext = createContext({ config: null, refreshConfig: () => {} });

export function useConfig() {
  return useContext(ConfigContext);
}

export default function ThemeProvider({ children }) {
  const [config, setConfig] = useState(null);

  const refreshConfig = useCallback((slug) => {
    api.publicConfig(slug)
      .then((cfg) => {
        setConfig(cfg);
        applyTheme(cfg);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Only load account branding if a slug is already known.
    // Without a slug, stay on default blue — prevents the first account in
    // the DB from leaking its branding onto every login page.
    const slug = getStoredSlug();
    if (slug) refreshConfig(slug);
  }, [refreshConfig]);

  return (
    <ConfigContext.Provider value={{ config, refreshConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function applyTheme(cfg) {
  if (!cfg) return;
  const root = document.documentElement;

  const primary   = cfg.primaryColor   || "#1e40af";
  const secondary = cfg.secondaryColor || "#7c3aed";

  root.style.setProperty("--brand",        primary);
  root.style.setProperty("--brand-hover",  darken(primary, 0.06));
  root.style.setProperty("--brand-light",  lighten(primary, 0.93));
  root.style.setProperty("--brand-muted",  lighten(primary, 0.70));
  root.style.setProperty("--accent",       secondary);
  root.style.setProperty("--accent-hover", darken(secondary, 0.08));
  root.style.setProperty("--accent-light", lighten(secondary, 0.92));

  if (cfg.appName) document.title = cfg.appName;

  if (cfg.faviconUrl) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = cfg.faviconUrl;
  }
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

function darken(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lighten(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}
