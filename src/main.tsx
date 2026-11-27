import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { createRepository } from './repositoryConfig'
import { matchRoute } from './routes'
import './styles.css'

const route = matchRoute(window.location.pathname, import.meta.env.BASE_URL)
const repository = createRepository()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App route={route} repository={repository} />
  </StrictMode>,
)
