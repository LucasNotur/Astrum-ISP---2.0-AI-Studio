import { supabase } from "./supabase";

export interface ThemeConfig {
  primary_color?: string;
  secondary_color?: string;
  font_family?: string;
  logo_url?: string;
  login_background_url?: string;
}

const DEFAULT_THEME = {
  primary_color: "#00C896",
  secondary_color: "#1e293b",
  font_family: "Inter, sans-serif",
  logo_url: "/logo-astrum.svg",
  login_background_url: ""
};

export const applyTheme = (theme: Partial<ThemeConfig>) => {
  const root = document.documentElement;
  if (!root) return; // for SSR or test environments

  if (theme.primary_color) {
    root.style.setProperty('--primary-color', theme.primary_color);
  } else {
    root.style.setProperty('--primary-color', DEFAULT_THEME.primary_color);
  }
  
  if (theme.secondary_color) {
    root.style.setProperty('--secondary-color', theme.secondary_color);
  }
  if (theme.font_family) {
    root.style.setProperty('--font-family', theme.font_family);
  }
  
  if (theme.logo_url) {
    root.style.setProperty('--logo-url', `url(${theme.logo_url})`);
  }
  
  if (theme.login_background_url) {
    root.style.setProperty('--login-background-url', `url(${theme.login_background_url})`);
  } else {
    root.style.setProperty('--login-background-url', `url(${DEFAULT_THEME.login_background_url})`);
  }
};

const themeCache = new Map<string, string>();

export const themeManager = {
  clearCache() {
    themeCache.clear();
  },
  async load(tenantId: string) {
    if (!tenantId) return;

    let themeStr = themeCache.get(`theme:${tenantId}`) || null;
    let theme: Partial<ThemeConfig> = {};

    if (themeStr) {
      theme = JSON.parse(themeStr);
    } else {
      // FZ-4: tema vem de tenants.theme (Supabase)
      try {
        const { data } = await supabase
          .from("tenants").select("theme").eq("id", tenantId).maybeSingle();
        if (data?.theme) {
          theme = data.theme;
          themeCache.set(`theme:${tenantId}`, JSON.stringify(theme));
        }
      } catch (err) {
        console.error("Failed to load theme", err);
      }
    }

    applyTheme(theme);
  }
};