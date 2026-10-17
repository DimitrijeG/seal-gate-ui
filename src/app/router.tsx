import { Navigate, createBrowserRouter } from 'react-router'
import { InitPage } from '../pages/init/InitPage'
import { LoginPage } from '../pages/login/LoginPage'
import { Placeholder } from '../pages/Placeholder'
import { UnsealPage } from '../pages/unseal/UnsealPage'
import { RequireSession, Start } from './guards'
import { Shell } from './Shell'

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <Start /> },
      { path: 'init', element: <InitPage /> },
      { path: 'unseal', element: <UnsealPage /> },
      { path: 'login', element: <LoginPage /> },
      {
        element: <RequireSession />,
        children: [
          { path: 'secrets/*', element: <Placeholder title="Secrets" /> },
          { path: 'identity/*', element: <Placeholder title="Identity" /> },
          { path: 'policies/*', element: <Placeholder title="Policies" /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
