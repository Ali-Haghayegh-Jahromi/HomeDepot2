import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import '@fontsource/figtree/400.css'
import '@fontsource/figtree/500.css'
import '@fontsource/figtree/600.css'
import '@fontsource/figtree/700.css'
import '@fontsource/figtree/800.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import { themes, defaultThemeSlug } from '../astryx-themes'
import './app.css'

import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Theme } from '@astryxdesign/core/theme'
import { ErrorBoundary } from './ErrorBoundary'
import { configureLog, installGlobalErrorReports } from './log'

/** Mounts one page: the Aisle theme (light: the store screens look the same everywhere), error reports. */
export function mount(source: 'phone' | 'stage', session: () => string | null, app: ReactNode): void {
  configureLog(source, session)
  installGlobalErrorReports()
  const root = document.getElementById('root')
  if (!root) return
  createRoot(root).render(
    <StrictMode>
      <Theme theme={themes[defaultThemeSlug]} mode="light">
        <ErrorBoundary>{app}</ErrorBoundary>
      </Theme>
    </StrictMode>,
  )
}
