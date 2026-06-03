import { AnnotateHeader } from './components/AnnotateHeader';
import { SidebarLeft } from './components/SidebarLeft';
import { CanvasArea } from './components/CanvasArea';
import { ToolbarRight } from './components/ToolbarRight';

export default function App() {
  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <AnnotateHeader />
      <div className="flex flex-1 overflow-hidden">
        <SidebarLeft />
        <CanvasArea />
        <ToolbarRight />
      </div>
    </div>
  );
}
