import { BrowserRouter, Routes, Route } from 'react-router';
import { Layout } from './components/Layout.js';
import { Dashboard } from './pages/Dashboard.js';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
