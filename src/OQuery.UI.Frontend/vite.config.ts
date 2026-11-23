import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
   // Dev proxy target only; VITE_BACKEND_API_URL would make the app call the API cross-origin.
   const backendApiUrl = env.OQUERY_API_PROXY_TARGET || env.VITE_BACKEND_API_URL || "http://localhost:21210";
  // const backendApiUrl = env.VITE_BACKEND_API_URL || "https://oquery-ui-1.onrender.com";

  return {
    plugins: [react()],
    // Relative asset URLs let the host serve the build under any base path (e.g. /oquery) via <base href>.
    base: command === "build" ? "./" : "/",
    server: {
      host: "127.0.0.1",
      port: 4173,
      proxy: {
        "/db": { target: backendApiUrl, changeOrigin: true },
        "/metadata": {
          target: backendApiUrl,
          changeOrigin: true,
          bypass: (req) => req.headers.accept?.includes("text/html") ? "/index.html" : undefined,
        },
        "/dynamic-query": { target: backendApiUrl, changeOrigin: true },
        "/query-request": { target: backendApiUrl, changeOrigin: true },
        "/playgrounds": { target: backendApiUrl, changeOrigin: true },
        "/analytics": { target: backendApiUrl, changeOrigin: true },
      },
    },
  };
});
