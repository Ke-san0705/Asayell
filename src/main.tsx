import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, ScrollRestoration, useLocation } from 'react-router'
import { App } from './App'
import { createRepository } from './repositoryConfig'
import { matchRoute } from './routes'
import './styles.css'

const repository = createRepository()

function RouteScreen() {
  const { pathname } = useLocation()
  return (
    <>
      <App route={matchRoute(pathname, import.meta.env.BASE_URL)} repository={repository} />
      <ScrollRestoration />
    </>
  )
}

const router = createBrowserRouter([{ path: '*', Component: RouteScreen }])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
