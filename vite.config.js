import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // مسارات مطلقة: صفحة ولي الأمر تعيش تحت /r/<رمز>، والمسار النسبي
  // يخليها تدوّر الأصول تحت /r/ فما تلقاها.
  base: '/',
});
