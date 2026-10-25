import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { YearPage } from './pages/YearPage'
import { MapPage } from './pages/MapPage'
import { ScenePage } from './pages/ScenePage'
import './App.css'

function Layout() {
  return (
    <main className="app">
      {/* Sayfalar tam ekran; marka başlığı yalnızca ekran okuyucular için. */}
      <h1 className="sr-only">Time Portal</h1>
      <Outlet />
    </main>
  )
}

/**
 * Rotalar (docs/FAZ3.md §1). Router'dan bağımsızdır; testler MemoryRouter ile sarar.
 * Harita iki rotada aynı bileşen ve aynı konumda olduğu için seçim değişince yeniden kurulmaz.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<YearPage />} />
        <Route path="yil/:yil" element={<MapPage />} />
        <Route path="yil/:yil/yer/:yer" element={<MapPage />} />
        <Route path="yil/:yil/yer/:yer/sahne" element={<ScenePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

// BrowserRouter gezinmeleri startTransition içinde yapar; <ViewTransition> sınırları bu sayede canlanır.
export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
