import basicSsl from '@vitejs/plugin-basic-ssl'

export default {
  https: true,
  strictPort: true,
  plugins: [
    basicSsl()
  ]
}
