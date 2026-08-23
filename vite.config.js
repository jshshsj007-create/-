import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // مسارات نسبية عشان يشتغل مهما كان مجلد الاستضافة
  base: './',
});
