import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Tailwind CSS 4 se aplica a través del cargador de Turbopack (el bundler
   * por defecto en Next.js 16). No se usa PostCSS para Tailwind porque el
   * proyecto usa la integración nativa de Tailwind 4 con Turbopack.
   *
   * `cacheComponents` y `partialPrefetching` se desactivan a propósito: la
   * aplicación sirve datos en vivo desde PostgreSQL (ranking, competición) y
   * usa `export const dynamic = 'force-dynamic'` en sus rutas.
   */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
