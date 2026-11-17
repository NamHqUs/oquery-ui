import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // const backendApiUrl = env.VITE_BACKEND_API_URL || "http://localhost:21210";
  const backendApiUrl = env.VITE_BACKEND_API_URL || "https://oquery-ui-1.onrender.com";

  return {
    plugins: [react()],
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
      },
    },
  };
});
