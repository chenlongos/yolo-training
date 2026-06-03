import { useState, useEffect, useRef } from 'react';
import { projects, datasets, images as imgApi, training as trainApi, models as modelApi } from '../api/endpoints';
import type { Project, Dataset, TrainedModel, Image, LabelClass } from '../types';
import Sidebar from '../components/Sidebar';
import ProjectSidebar, { type RightPanel } from '../components/ProjectSidebar';
import AnnotationTool from '../components/AnnotationTool';
import TrainingModal from '../components/TrainingModal';
import Modal from '../components/Modal';
import UploadPanel from './UploadPanel';
import DataPanel from './DataPanel';
import ImageGrid from './ImageGrid';
import ModelPanel from './ModelPanel';
import ModelDetail from './ModelDetail';

type NavItem = 'projects' | 'models' | 'marketplace';
type SourceType = 'webcam' | 'file' | 'ipcam';

export default function Workspace() {
  const [nav, setNav] = useState<NavItem>('projects');
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState('');
  const [activeDataset, setActiveDataset] = useState('');
  const [activeModelId, setActiveModelId] = useState('');
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [datasetList, setDatasetList] = useState<Dataset[]>([]);
  const [modelList, setModelList] = useState<TrainedModel[]>([]);
  const [imgList, setImgList] = useState<Image[]>([]);
  const [imgPage, setImgPage] = useState(1);
  const [imgTotal, setImgTotal] = useState(0);
  const [classes, setClasses] = useState<LabelClass[]>([]);

  // 上传
  const [sourceType, setSourceType] = useState<SourceType>('webcam');
  const [ipUrl, setIpUrl] = useState('http://192.168.1.100:8080/video');
  const [camActive, setCamActive] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  // 弹窗
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewDataset, setShowNewDataset] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [trainOpen, setTrainOpen] = useState(false);
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annotateIdx, setAnnotateIdx] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 加载
  useEffect(() => { projects.list().then(d => setProjectList(d.items)); }, []);
  useEffect(() => { if (!activeProject) return; datasets.list(activeProject).then(setDatasetList); modelApi.list(activeProject).then(d => setModelList(d.items)); }, [activeProject]);
  useEffect(() => { if (!activeDataset) return; setImgPage(1); imgApi.get(activeDataset).then(() => {}).catch(() => {}); datasets.images(activeDataset, 1).then(d => { setImgList(d.items); setImgTotal(d.total); }); datasets.classes(activeDataset).then(setClasses); }, [activeDataset]);
  useEffect(() => { if (!activeDataset || rightPanel !== 'dataset') return; datasets.images(activeDataset, imgPage).then(d => { setImgList(d.items); setImgTotal(d.total); }); }, [imgPage]);

  const activeDatasets = datasetList.filter(d => d.project_id === activeProject);
  const activeModels = modelList.filter(m => m.project_id === activeProject);

  async function createProject() { await projects.create({ name: newProjectName }); setShowNewProject(false); setNewProjectName(''); projects.list().then(d => setProjectList(d.items)); }
  async function createDataset() { if (!activeProject) return; await datasets.create(activeProject, { name: newDatasetName }); setShowNewDataset(false); setNewDatasetName(''); datasets.list(activeProject).then(setDatasetList); }
  async function doUpload() { if (!activeDataset || uploadFiles.length === 0) return; setUploading(true); const fd = new FormData(); uploadFiles.forEach(f => fd.append('files', f)); try { await datasets.upload(activeDataset, fd, pct => setUploadProgress(pct)); setUploadFiles([]); datasets.list(activeProject).then(setDatasetList); } finally { setUploading(false); setUploadProgress(0); } }

  async function toggleCamera() {
    if (camActive) { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } if (videoRef.current) videoRef.current.srcObject = null; setCamActive(false); }
    else { setCamActive(true); if (sourceType === 'webcam') { try { const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }); if (videoRef.current) { videoRef.current.srcObject = stream; streamRef.current = stream; } } catch {} } }
  }
  async function captureFrame() {
    if (!activeDataset) return; const v = videoRef.current || document.getElementById('capture-video') as HTMLVideoElement; if (!v) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/jpeg', 0.9));
    const fd = new FormData(); fd.append('files', blob, `capture_${Date.now()}.jpg`);
    await datasets.upload(activeDataset, fd); setCaptureCount(c => c + 1); datasets.list(activeProject).then(setDatasetList);
  }

  async function handleTraining(config: { name: string; model: string; epochs: number; imgsz: number; batch: number; device: string; datasetId: string }) {
    try {
      const cfg = await trainApi.createConfig(activeProject, { ...config, base_model: config.model, workers: 4, optimizer: 'auto', lr0: 0.01, lrf: 0.01, momentum: 0.937, weight_decay: 0.0005, warmup_epochs: 3, augment: true, extra_args: {} });
      await trainApi.startJob({ model_config_id: cfg.id, dataset_id: config.datasetId, name: config.name || 'train' });
      alert('训练已启动'); setTrainOpen(false);
    } catch (e: any) { alert('启动失败: ' + e.message); }
  }

  function openAnnotator(datasetId: string, idx = 0) {
    setActiveDataset(datasetId); setAnnotateIdx(idx); setAnnotateOpen(true);
  }

  if (annotateOpen) {
    return <AnnotationTool datasetId={activeDataset} images={imgList} classes={classes} startIndex={annotateIdx} onClose={() => setAnnotateOpen(false)} />;
  }

  const projectName = projectList.find(p => p.id === activeProject)?.name || '';
  const activeModelObj = activeModels.find(m => m.id === activeModelId);

  return (
    <div className="h-full flex">
      <Sidebar nav={nav} collapsed={!!activeProject} onNav={key => { setNav(key); setActiveProject(''); }} />

      <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">
        <div className="flex-1 flex overflow-hidden">
          {activeProject && nav === 'projects' && (
            <ProjectSidebar
              projectName={projectName} datasets={activeDatasets} models={activeModels}
              activeDataset={activeDataset} rightPanel={rightPanel}
              onBack={() => setActiveProject('')}
              onRightPanel={setRightPanel}
              onSelectDataset={id => { setActiveDataset(id); setRightPanel('dataset'); }}
              onShowNewDataset={() => setShowNewDataset(true)}
              onOpenAnnotator={() => { if (activeDataset) openAnnotator(activeDataset); }}
              onOpenTraining={() => setTrainOpen(true)}
            />
          )}

          <div className="flex-1 overflow-y-auto p-6 flex flex-col">
            {nav === 'projects' && activeProject ? (
              <>
                {rightPanel === 'upload' && <UploadPanel
                  sourceType={sourceType} ipUrl={ipUrl} camActive={camActive}
                  uploadFiles={uploadFiles} uploadProgress={uploadProgress} uploading={uploading} captureCount={captureCount}
                  onSourceType={setSourceType} onIpUrl={setIpUrl} onToggleCamera={toggleCamera} onCapture={captureFrame}
                  onFileSelect={files => setUploadFiles(prev => [...prev, ...files].slice(0, 500))}
                  onUpload={doUpload} onClearFiles={() => setUploadFiles([])}
                />}
                {rightPanel === 'data' && <DataPanel datasets={activeDatasets} onSelect={id => { setActiveDataset(id); setRightPanel('dataset'); }} onNewDataset={() => setShowNewDataset(true)} />}
                {rightPanel === 'dataset' && activeDataset && (
                  <ImageGrid dataset={activeDatasets.find(d => d.id === activeDataset)!} images={imgList} classes={classes}
                    page={imgPage} total={imgTotal} onPage={setImgPage} onSearch={() => {}}
                    onAnnotate={id => openAnnotator(id)} onTrain={() => setTrainOpen(true)}
                    onImageClick={idx => openAnnotator(activeDataset, idx)} />
                )}
                {rightPanel === 'models' && <ModelPanel models={activeModels} onSelect={id => { setActiveModelId(id); setRightPanel('modelDetail'); }} />}
                {rightPanel === 'modelDetail' && activeModelObj && <ModelDetail model={activeModelObj} />}
                {!rightPanel && <div className="w-full flex-1 flex items-center justify-center text-gray-400 text-sm">请从左侧选择功能</div>}
              </>
            ) : !activeProject && nav === 'projects' ? (
              <div className="w-full flex-1 p-6">
                {projectList.length === 0 ? (
                  <div className="text-center py-24">
                    <h2 className="text-xl font-semibold text-gray-700 mb-2">创建你的第一个项目</h2>
                    <p className="text-gray-500 mb-6 text-sm">上传图片、标注数据、训练模型</p>
                    <button onClick={() => setShowNewProject(true)} className="px-6 py-2.5 bg-[#7c3aed] text-white rounded-lg font-medium hover:bg-[#6d28d9]">新建项目</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {projectList.map(p => {
                      const dsCount = datasetList.filter(d => d.project_id === p.id).length;
                      const mCount = modelList.filter(m => m.project_id === p.id).length;
                      const daysAgo = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
                      return (
                        <div key={p.id} onClick={() => setActiveProject(p.id)}
                          className="flex items-start gap-4 p-4 border border-gray-200 rounded-xl hover:shadow-md transition-shadow cursor-pointer bg-white">
                          <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center">
                            <span className="text-2xl font-bold text-[#7c3aed]">{p.name[0]?.toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Object Detection</span>
                            <h3 className="font-semibold text-gray-900 text-sm mt-1.5">{p.name}</h3>
                            <p className="text-xs text-gray-500 mt-1">{daysAgo === 0 ? '今天' : `${daysAgo} 天前`} 编辑</p>
                            <p className="text-xs text-gray-500 mt-0.5">{dsCount} Datasets · {mCount} Models</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : nav === 'models' ? (
              <div className="w-full flex-1 p-6">
                {activeProject ? (
                  <>
                    <button onClick={() => setActiveProject('')} className="text-sm text-gray-500 hover:text-gray-700 mb-4 block">← 所有项目</button>
                    <ModelPanel models={activeModels} onSelect={id => { setActiveModelId(id); setRightPanel('modelDetail'); }} />
                    {activeModelObj && rightPanel === 'modelDetail' && <div className="mt-4"><ModelDetail model={activeModelObj} /></div>}
                  </>
                ) : (
                  <ModelPanel models={modelList} onSelect={() => {}} />
                )}
              </div>
            ) : (
              <div className="w-full flex-1 p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-gray-800 mb-4">公开数据集</h3>
                    <div className="space-y-2">
                      {[{ name: 'COCO 2017', images: '118K', classes: '80' }, { name: 'VOC 2012', images: '17K', classes: '20' }, { name: 'Open Images', images: '9M', classes: '600' }].map(ds => (
                        <div key={ds.name} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                          <div><span className="text-sm font-medium text-gray-800">{ds.name}</span><span className="text-xs text-gray-500 ml-2">{ds.images} 张 · {ds.classes} 类</span></div>
                          <button className="text-sm text-emerald-600 font-medium">导入</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-gray-800 mb-4">预训练模型</h3>
                    <div className="space-y-2">
                      {[{ name: 'YOLOv8n', mAP: '37.3', size: '3.2MB' }, { name: 'YOLOv8s', mAP: '44.9', size: '11.2MB' }, { name: 'YOLOv8m', mAP: '50.2', size: '25.9MB' }].map(m => (
                        <div key={m.name} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                          <div><span className="text-sm font-medium text-gray-800">{m.name}</span><span className="text-xs text-gray-500 ml-2">mAP {m.mAP} · {m.size}</span></div>
                          <button className="text-sm text-violet-600 font-medium">下载</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showNewProject && <Modal title="新建项目" onClose={() => setShowNewProject(false)} onConfirm={createProject}>
        <input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="项目名称" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
      </Modal>}
      {showNewDataset && <Modal title="新建数据集" onClose={() => setShowNewDataset(false)} onConfirm={createDataset}>
        <input value={newDatasetName} onChange={e => setNewDatasetName(e.target.value)} placeholder="数据集名称" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
      </Modal>}
      {trainOpen && <TrainingModal
        datasets={activeDatasets.map(d => ({ id: d.id, name: d.name }))}
        onStart={handleTraining} onClose={() => setTrainOpen(false)} />}
    </div>
  );
}
