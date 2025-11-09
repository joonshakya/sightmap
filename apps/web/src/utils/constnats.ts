export const SERVER_URL =
  window.location.hostname === "sightmap.joon.com.np"
    ? "https://mac.joon.com.np"
    : import.meta.env.VITE_SERVER_URL;
