import { UploadCloud, Edit3, Database, Tag, Cpu, Box, Rocket, ChevronDown, Plus, MoreHorizontal, Layout } from 'lucide-react';
import type { Dataset, TrainedModel } from '../types';

export type RightPanel = 'upload' | 'data' | 'dataset' | 'models' | 'modelDetail' | null;

interface NavItemData {
  label: string;
  icon: React.ElementType;
  badge?: string | number;
  active?: boolean;
  onClick: () => void;
}

interface NavSectionData {
  title: string;
  items: NavItemData[];
}

interface Props {
  projectName: string;
  datasets: Dataset[];
  models: TrainedModel[];
  activeDataset: string;
  rightPanel: RightPanel;
  onRightPanel: (p: RightPanel) => void;
  onSelectDataset: (id: string) => void;
  onShowNewDataset: () => void;
  onOpenAnnotator: () => void;
  onOpenTraining: () => void;
  onBack: () => void;
}

const NavItem = ({ label, icon: Icon, badge, active, onClick }: NavItemData) => (
  <button onClick={onClick}
    className={`flex h-9 w-full items-center gap-2 rounded border px-3 text-xs font-medium transition-all cursor-pointer ${active ? 'bg-violet-50 text-violet-600 border-violet-200' : 'bg-transparent text-gray-600 border-transparent hover:bg-gray-100 hover:text-gray-900'}`}>
    <Icon size={16} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
    <span className="whitespace-nowrap">{label}</span>
    {badge !== undefined && (
      <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-md bg-white text-[10px] font-semibold text-gray-500 shadow-sm border border-gray-100">{badge}</span>
    )}
  </button>
);

export default function ProjectSidebar(props: Props) {
  const { datasets, models, activeDataset, rightPanel } = props;
  const totalImages = datasets.reduce((s, d) => s + d.image_count, 0);

  const sections: NavSectionData[] = [
    {
      title: 'Data',
      items: [
        { label: '上传数据', icon: UploadCloud, active: rightPanel === 'upload', onClick: () => props.onRightPanel('upload') },
        { label: '标注', icon: Edit3, onClick: () => props.onOpenAnnotator() },
        { label: '数据集', icon: Database, badge: totalImages, active: rightPanel === 'data' || rightPanel === 'dataset',
          onClick: () => { if (datasets.length === 1) { props.onSelectDataset(datasets[0].id); props.onRightPanel('dataset'); } else { props.onRightPanel('data'); } } },
        { label: '类别管理', icon: Tag, onClick: () => props.onShowNewDataset() },
      ],
    },
    {
      title: 'Models',
      items: [
        { label: '训练', icon: Cpu, onClick: () => props.onOpenTraining() },
        { label: '模型', icon: Box, badge: models.length, active: rightPanel === 'models' || rightPanel === 'modelDetail',
          onClick: () => props.onRightPanel('models') },
      ],
    },
    {
      title: 'Deploy',
      items: [
        { label: '部署', icon: Rocket, onClick: () => props.onRightPanel('models') },
      ],
    },
  ];

  return (
    <nav className="w-44 bg-gray-50/60 border-r border-gray-200 flex flex-col shrink-0 h-full py-2 gap-3">
      {/* 顶部：工作区 + 项目预览 */}
      <button onClick={props.onBack}
        className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase text-gray-500 transition-all rounded hover:bg-gray-200/50 hover:text-gray-900">
        <Plus size={14} className="shrink-0" />
        <span className="truncate">工作区</span>
      </button>

      <div className="flex flex-col px-2">
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium bg-white border border-gray-100 rounded-md text-gray-700 w-fit shadow-sm">
          <Layout size={10} className="text-gray-400" />
          <span>Object Detection</span>
        </div>
        <div className="relative h-20 w-full -mt-1.5 overflow-hidden rounded-b-lg border border-gray-100 bg-gray-50">
          <div className="h-full w-full bg-gradient-to-br from-violet-100 to-purple-200 flex items-center justify-center">
            <span className="text-2xl font-bold text-violet-400">{props.projectName[0]?.toUpperCase()}</span>
          </div>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="flex-1 truncate text-sm font-medium text-gray-900 pl-1" title={props.projectName}>{props.projectName}</span>
          <button className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200/50 text-gray-600 hover:bg-gray-200">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {sections.map(section => (
        <div key={section.title} className="flex flex-col gap-1">
          <button className="flex w-full items-center justify-between bg-transparent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-900">
            <span>{section.title}</span>
            <ChevronDown size={12} className="text-gray-400" />
          </button>
          <div className="flex flex-col gap-1 px-2">
            {section.items.map(item => (
              <NavItem key={item.label} {...item} />
            ))}
          </div>
        </div>
      ))}

      {/* 数据集子列表 */}
      {datasets.length > 0 && rightPanel === 'dataset' && (
        <div className="flex flex-col gap-1 px-2">
          {datasets.map(d => (
            <button key={d.id} onClick={() => { props.onSelectDataset(d.id); props.onRightPanel('dataset'); }}
              className={`flex h-8 w-full items-center gap-2 rounded border px-3 text-xs transition-all cursor-pointer ${activeDataset === d.id ? 'bg-violet-50 text-violet-600 border-violet-200' : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-100'}`}>
              <Database size={14} />
              <span className="truncate whitespace-nowrap">{d.name}</span>
              <span className="ml-auto text-[10px] text-gray-400">{d.image_count}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
