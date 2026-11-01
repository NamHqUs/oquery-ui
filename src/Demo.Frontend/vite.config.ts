import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendApiUrl = env.VITE_BACKEND_API_URL || "http://localhost:21210";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/db": backendApiUrl,
        "/metadata": {
          target: backendApiUrl,
          bypass: (req) => req.headers.accept?.includes("text/html") ? "/index.html" : undefined,
        },
        "/dynamic-query": backendApiUrl,
        "^/report(?:/|$)": backendApiUrl,
        "^/query-request(?:/|$)": backendApiUrl,
      },
    },
  };
});
