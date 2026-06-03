import { Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="h-screen w-full bg-white overflow-hidden flex flex-col">
      <Outlet />
    </div>
  );
}
