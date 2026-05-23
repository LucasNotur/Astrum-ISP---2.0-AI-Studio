export interface ThemeConfig {
  primary_color: string;
  secondary_color: string;
  font_family: string;
  logo_url: string;
  login_background_url: string;
}

export const applyTheme = (theme: Partial<ThemeConfig>) => {
  const root = document.documentElement;
  if (theme.primary_color) {
    root.style.setProperty('--primary-color', theme.primary_color);
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
  }
};
