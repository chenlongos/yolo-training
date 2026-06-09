import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { projects, projectData, images as imgApi, training as trainApi, models as modelApi } from '../api/endpoints';
import type { Project, TrainedModel, Image, LabelClass } from '../types';
import Sidebar from '../components/Sidebar';
import ProjectSidebar, { type RightPanel } from '../components/ProjectSidebar';
import AnnotationTool from '../components/AnnotationTool';
import TrainingPage from './TrainingPage';
import Modal from '../components/Modal';
import UploadPanel from './UploadPanel';
import ImageGrid from './ImageGrid';
import ModelPanel from './ModelPanel';
import ModelDetail from './ModelDetail';
import InferencePanel from './InferencePanel';
import DeployPanel from './DeployPanel';

type NavItem = 'projects' | 'models' | 'marketplace';
type SourceType = 'webcam' | 'file' | 'ipcam';

export default function Workspace() {
  const nav = useNavigate();
  const loc = useLocation();

  const [navTab, setNavTab] = useState<NavItem>('projects');
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState('');
  const [activeModelId, setActiveModelId] = useState('');
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [modelList, setModelList] = useState<TrainedModel[]>([]);
  const [imgList, setImgList] = useState<Image[]>([]);
  const [imgPage, setImgPage] = useState(1);
  const [imgTotal, setImgTotal] = useState(0);
  const [classes, setClasses] = useState<LabelClass[]>([]);
  const [trainingJobs, setTrainingJobs] = useState<any[]>([]);

  // 上传
  const [sourceType, setSourceType] = useState<SourceType>('webcam');
  const [ipUrl, setIpUrl] = useState('http://192.168.1.100:8080/video');
  const [camActive, setCamActive] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  // 弹窗
  const [projectThumbs, setProjectThumbs] = useState<Record<string, string>>({});
  const [projectModelCounts, setProjectModelCounts] = useState<Record<string, number>>({});
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annotateIdx, setAnnotateIdx] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 加载
  useEffect(() => { projects.list().then(d => setProjectList(d.items)).catch(() => {}); }, []);

  // 加载项目缩略图和模型数量
  useEffect(() => {
    projectList.forEach(p => {
      if (!projectThumbs[p.id]) {
        projectData.images(p.id, 1).then(d => {
          if (d.items.length > 0) {
            const thumb = d.items[0].thumbnail_url || d.items[0].image_url;
            if (thumb) setProjectThumbs(prev => ({ ...prev, [p.id]: thumb }));
          }
        }).catch(() => {});
      }
      // Load model count per project
      modelApi.list(p.id).then(d => {
        setProjectModelCounts(prev => ({ ...prev, [p.id]: d.items?.length || 0 }));
      }).catch(() => {});
    });
  }, [projectList]);

  // URL → state 解析
  useEffect(() => {
    const parts = loc.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (parts[0] === 'models') { setNavTab('models'); }
    else if (parts[0] === 'marketplace') { setNavTab('marketplace'); }
    else if (parts[0] === 'projects' && parts[1]) {
      setNavTab('projects');
      setActiveProject(parts[1]);
      if (parts[2] === 'train') { setRightPanel('train'); }
    }
  }, []);

  // URL 同步：state → URL
  useEffect(() => {
    const parts: string[] = [];
    if (navTab === 'projects' && activeProject) {
      parts.push('projects', activeProject);
      if (rightPanel === 'train') { parts.push('train'); }
    } else if (navTab === 'models') { parts.push('models'); }
    else if (navTab === 'marketplace') { parts.push('marketplace'); }
    const path = '/' + parts.join('/');
    if (loc.pathname !== path) nav(path, { replace: true });
  }, [navTab, activeProject, rightPanel]);
  useEffect(() => { if (!activeProject) return; setImgList([]); modelApi.list(activeProject).then(d => setModelList(d.items || [])).catch(() => {}); trainApi.listJobs(activeProject).then(d => setTrainingJobs(d.items || [])).catch(() => {}); }, [activeProject]);

  // Load training jobs for models tab without project
  useEffect(() => {
    if (activeProject || navTab !== 'models') return;
    trainApi.listJobs().then(d => setTrainingJobs(d.items || [])).catch(() => {});
  }, [activeProject, navTab]);

  // Poll training jobs when viewing models (anywhere)
  useEffect(() => {
    const viewingModels = navTab === 'models' || rightPanel === 'models' || rightPanel === 'modelDetail';
    if (!viewingModels) return;
    const hasRunning = trainingJobs.some(j => j.status === 'running' || j.status === 'queued');
    if (!hasRunning) return;
    const timer = setInterval(() => {
      trainApi.listJobs(activeProject || undefined).then(d => setTrainingJobs(d.items || [])).catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [activeProject, navTab, rightPanel, trainingJobs]);
  useEffect(() => { if (!activeProject) return; setImgPage(1); projectData.images(activeProject, 1).then(d => { setImgList(d.items); setImgTotal(d.total); }); projectData.classes(activeProject).then(setClasses); }, [activeProject]);
  useEffect(() => { if (!activeProject || rightPanel !== 'dataset') return; projectData.images(activeProject, imgPage).then(d => { setImgList(d.items); setImgTotal(d.total); }); }, [imgPage]);

  const activeModels = modelList.filter(m => m.project_id === activeProject);

  async function handleDeleteModel(id: string, name: string) {
    if (!window.confirm(`确认删除模型 "${name}"？此操作不可撤销。`)) return;
    try {
      await modelApi.delete(id);
      if (activeModelId === id) { setActiveModelId(''); setRightPanel('models'); }
      modelApi.list(activeProject).then(d => setModelList(d.items || [])).catch(() => {});
    } catch { /* ignore */ }
  }

  async function handleCancelJob(id: string) {
    if (!window.confirm('确认取消此训练任务？')) return;
    try {
      await trainApi.cancelJob(id);
    } catch { /* job may already be deleted */ }
    trainApi.listJobs(activeProject).then(d => setTrainingJobs(d.items || [])).catch(() => {});
  }

  async function createProject() { await projects.create({ name: newProjectName }); setShowNewProject(false); setNewProjectName(''); projects.list().then(d => setProjectList(d.items)); }
  async function doUpload() {
    if (uploadFiles.length === 0) return;
    setUploading(true);
    const fd = new FormData();
    uploadFiles.forEach(f => fd.append('files', f));
    try {
      const res = await projectData.upload(activeProject, fd, pct => setUploadProgress(pct));
      const errs = (res && (res as any).errors) || [];
      const ok = (res && (res as any).uploaded) || 0;
      if (errs.length) {
        const sample = errs.slice(0, 3).map((e: any) => `${e.filename}: ${e.error}`).join('\n');
        const more = errs.length > 3 ? `\n...还有 ${errs.length - 3} 个错误` : '';
        alert(`上传完成:成功 ${ok} 个,失败 ${errs.length} 个\n\n${sample}${more}`);
      }
      setUploadFiles([]);
      projectData.images(activeProject, imgPage).then(d => { setImgList(d.items); setImgTotal(d.total); });
    } catch (e: any) {
      alert('上传失败: ' + (e?.message || String(e)));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function toggleCamera() {
    if (camActive) { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } if (videoRef.current) videoRef.current.srcObject = null; setCamActive(false); }
    else { setCamActive(true); if (sourceType === 'webcam') { try { const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }); if (videoRef.current) { videoRef.current.srcObject = stream; streamRef.current = stream; } } catch {} } }
  }
  async function captureFrame() {
    const v = videoRef.current || document.getElementById('capture-video') as HTMLVideoElement; if (!v) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/jpeg', 0.9));
    const fd = new FormData(); fd.append('files', blob, `capture_${Date.now()}.jpg`);
    await projectData.upload(activeProject, fd); setCaptureCount(c => c + 1);
    projectData.images(activeProject, imgPage).then(d => { setImgList(d.items); setImgTotal(d.total); });
  }

  async function handleTraining(config: { name: string; model: string; epochs: number; imgsz: number; batch: number; datasetId?: string }) {
    const cfg = await trainApi.createConfig(activeProject, { ...config, name: config.name || 'train', base_model: config.model, device: '', workers: 4, optimizer: 'auto', lr0: 0.01, lrf: 0.01, momentum: 0.937, weight_decay: 0.0005, warmup_epochs: 3, augment: true, extra_args: {} });
    const job = await trainApi.startJob({ model_config_id: cfg.id, dataset_id: config.datasetId || '', name: config.name || 'train' });
    setRightPanel('models');
    modelApi.list(activeProject).then(d => setModelList(d.items || [])).catch(() => {});
    trainApi.listJobs(activeProject).then(d => setTrainingJobs(d.items || [])).catch(() => {});
    return job;
  }

  function openAnnotator(idx = 0) {
    setAnnotateIdx(idx); setAnnotateOpen(true);
  }

  if (annotateOpen) {
    return <AnnotationTool projectId={activeProject} images={imgList} classes={classes} startIndex={annotateIdx}
      onClose={() => setAnnotateOpen(false)}
      onAnnotated={(imageId) => setImgList(prev => prev.map(im => im.id === imageId ? { ...im, status: 'annotated' } : im))}
    />;
  }
  const projectName = projectList.find(p => p.id === activeProject)?.name || '';
  const activeModelObj = activeModels.find(m => m.id === activeModelId);

  return (
    <div className="h-full flex">
      <Sidebar nav={navTab} collapsed={!!activeProject} onNav={key => { setNavTab(key); if (key !== navTab || activeProject) setActiveProject(''); }} />

      <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">
        <div className="flex-1 flex overflow-hidden">
          {activeProject && navTab === 'projects' && (
            <ProjectSidebar
              projectName={projectName} thumbnailUrl={projectThumbs[activeProject]}
              models={activeModels}
              totalImages={imgTotal} rightPanel={rightPanel}
              onBack={() => setActiveProject('')}
              onRightPanel={(p) => { setRightPanel(p); }}
              onOpenAnnotator={() => openAnnotator()}
              onOpenTraining={() => { setRightPanel(rightPanel === 'train' ? 'models' : 'train'); }}
            />
          )}

          <div className="flex-1 overflow-y-auto p-6 flex flex-col">
            {navTab === 'projects' && activeProject ? (
              <>
                {rightPanel === 'train' && (
                  <TrainingPage
                    onStart={handleTraining} onClose={() => setRightPanel('models')} training={false} />
                )}
                {rightPanel === 'upload' && <UploadPanel
                  sourceType={sourceType} ipUrl={ipUrl} camActive={camActive}
                  uploadFiles={uploadFiles} uploadProgress={uploadProgress} uploading={uploading} captureCount={captureCount}
                  onSourceType={setSourceType} onIpUrl={setIpUrl} onToggleCamera={toggleCamera} onCapture={captureFrame}
                  onFileSelect={files => setUploadFiles(prev => [...prev, ...files].slice(0, 500))}
                  onUpload={doUpload} onClearFiles={() => setUploadFiles([])}
                />}
                {rightPanel === 'data' && (
                  <div className="w-full flex-1 flex items-center justify-center text-gray-400 text-sm" onClick={() => setRightPanel('dataset')} style={{ cursor: 'pointer' }}>
                    点击查看图片数据
                  </div>
                )}
                {rightPanel === 'dataset' && (
                  <ImageGrid projectId={activeProject} projectName={projectName} images={imgList} classes={classes}
                    page={imgPage} total={imgTotal} onPage={setImgPage} onSearch={() => {}}
                    onAnnotate={() => openAnnotator()} onTrain={() => { setRightPanel('train'); }}
                    onImageClick={idx => openAnnotator(idx)}
                    onDeleteImages={async (ids) => {
                      for (const id of ids) {
                        await fetch(`/api/v1/images/${id}`, { method: 'DELETE' });
                      }
                      projectData.images(activeProject, imgPage).then(d => { setImgList(d.items); setImgTotal(d.total); });
                    }} />
                )}
                {rightPanel === 'models' && <ModelPanel models={activeModels} jobs={trainingJobs} onSelect={id => { setActiveModelId(id); setRightPanel('modelDetail'); }} onDelete={handleDeleteModel} onCancelJob={handleCancelJob} />}
                {rightPanel === 'modelDetail' && activeModelObj && <ModelDetail model={activeModelObj} onDelete={handleDeleteModel} onInference={(id) => { setActiveModelId(id); setRightPanel('inference'); }} onRefresh={() => { modelApi.list(activeProject).then(d => setModelList(d.items || [])).catch(() => {}); }} />}
                {rightPanel === 'inference' && <InferencePanel models={activeModels} activeModelId={activeModelId} />}
                {rightPanel === 'deploy' && <DeployPanel models={activeModels} />}
                {!rightPanel && <div className="w-full flex-1 flex items-center justify-center text-gray-400 text-sm">请从左侧选择功能</div>}
              </>
            ) : !activeProject && navTab === 'projects' ? (
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
                      const mCount = projectModelCounts[p.id] ?? 0;
                      const daysAgo = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
                      return (
                        <div key={p.id} onClick={() => setActiveProject(p.id)}
                          className="flex items-start gap-4 p-4 border border-gray-200 rounded-xl hover:shadow-md transition-shadow cursor-pointer bg-white">
                          <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center">
                            {projectThumbs[p.id] ? (
                              <img src={projectThumbs[p.id]} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-2xl font-bold text-[#7c3aed]">{p.name[0]?.toUpperCase()}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Object Detection</span>
                            <h3 className="font-semibold text-gray-900 text-sm mt-1.5">{p.name}</h3>
                            <p className="text-xs text-gray-500 mt-1">{daysAgo === 0 ? '今天' : `${daysAgo} 天前`} 编辑</p>
                            <p className="text-xs text-gray-500 mt-0.5">{mCount} Models</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : navTab === 'models' ? (
              <div className="w-full flex-1 p-6">
                {activeProject ? (
                  <>
                    <button onClick={() => setActiveProject('')} className="text-sm text-gray-500 hover:text-gray-700 mb-4 block">← 所有项目</button>
                    <ModelPanel models={activeModels} jobs={trainingJobs} onSelect={id => { setActiveModelId(id); setRightPanel('modelDetail'); }} onDelete={handleDeleteModel} onCancelJob={handleCancelJob} />
                    {activeModelObj && rightPanel === 'modelDetail' && <div className="mt-4"><ModelDetail model={activeModelObj} onDelete={handleDeleteModel} onInference={(id) => { setActiveModelId(id); setRightPanel('inference'); }} onRefresh={() => { modelApi.list(activeProject).then(d => setModelList(d.items || [])).catch(() => {}); }} /></div>}
                  </>
                ) : (
                  <ModelPanel models={modelList} jobs={trainingJobs} onSelect={() => {}} onDelete={handleDeleteModel} onCancelJob={handleCancelJob} />
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
    </div>
  );
}
