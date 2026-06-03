import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Workspace from './pages/Workspace';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<Workspace />} />
      </Routes>
    </BrowserRouter>
  );
}
