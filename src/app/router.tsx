import { Navigate, createBrowserRouter } from 'react-router'
import { InitPage } from '../pages/init/InitPage'
import { LoginPage } from '../pages/login/LoginPage'
import { Placeholder } from '../pages/Placeholder'
import { PoliciesPage } from '../pages/policies/PoliciesPage'
import { SecretsPage } from '../pages/secrets/SecretsPage'
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
          { path: 'secrets/*', element: <SecretsPage />, handle: { wide: true } },
          { path: 'identity/*', element: <Placeholder title="Identity" /> },
          { path: 'policies/:name?', element: <PoliciesPage />, handle: { wide: true } },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
