import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { LocalStorageRepository } from './repository'
import { matchRoute } from './routes'
import './styles.css'

const route = matchRoute(window.location.pathname, import.meta.env.BASE_URL)
const repository = new LocalStorageRepository()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App route={route} repository={repository} />
  </StrictMode>,
)
