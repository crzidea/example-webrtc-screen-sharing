import basicSsl from "@vitejs/plugin-basic-ssl";

export default {
  server: {
    https: true,
    strictPort: true,
    host: true,
  },
  plugins: [basicSsl()],
};
