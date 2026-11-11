export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "/api/v1/codynex",
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL || "http://127.0.0.1:8000",
  appName: process.env.NEXT_PUBLIC_APP_NAME || "CodyNex OS",
};

export const TOKEN_KEY = "codynex_access_token";
export const USER_KEY = "codynex_user";
export const THEME_KEY = "codynex_theme";
