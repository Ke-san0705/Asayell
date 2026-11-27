import { copyFile } from 'node:fs/promises'

// GitHub Pages serves this document for direct requests to SPA routes.
await copyFile('dist/index.html', 'dist/404.html')
