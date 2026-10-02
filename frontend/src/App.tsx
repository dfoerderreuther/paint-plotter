import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, App as AntApp, Flex, Layout, Spin, Tabs, Tag, Tooltip, Typography } from 'antd'
import {
  BgColorsOutlined,
  FolderOutlined,
  HighlightOutlined,
  NodeIndexOutlined,
  PictureOutlined,
} from '@ant-design/icons'
import {
  DEFAULT_PAINT_SETTINGS,
  NotFoundError,
  arrangeWellLayout,
  checkWellLayout,
  createProject,
  deleteProject,
  deleteWellLayout,
  downloadPaintingZip,
  downloadWellLayoutGcode,
  fetchConfig,
  getProject,
  getWellLayout,
  listProjects,
  listWellLayouts,
  matchColors,
  planPainting,
  renameProject,
  saveProject,
  saveWellLayout,
  uploadProjectSvg,
  wellLayoutGcodeText,
  type ColorMatch,
  type PaintPlan,
  type PaintRequest,
  type PaintSettings,
  type PlotterConfig,
  type Project,
  type ProjectData,
  type ProjectInfo,
  type Rect,
  type SvgDrawing,
  type WellLayout,
} from './api'
import { resolveColorMap, type ColorChoices } from './colorMap'
import AppMenu, { type MenuAction } from './components/AppMenu'
import Bed from './components/Bed'
import ColorsPanel from './components/ColorsPanel'
import DrawingPanel from './components/DrawingPanel'
import DrawingView from './components/DrawingView'
import LoadSvgModal from './components/LoadSvgModal'
import PaintPanel from './components/PaintPanel'
import { OpenLayoutModal, SaveLayoutModal } from './components/LayoutModals'
import PlotterDrawer from './components/PlotterDrawer'
import { OpenProjectModal, ProjectNameModal } from './components/ProjectModals'
import StatusBar from './components/StatusBar'
import ToolpathView from './components/ToolpathView'
import WellsPanel from './components/WellsPanel'
import WellsView from './components/WellsView'
import { DEFAULT_PLACEMENT, placedRect, type Placement } from './placement'

const { Header, Sider, Content } = Layout

const newLayout = (): WellLayout => ({ name: 'untitled', palette: null, margin_mm: 5, wells: [] })

type Dialog =
  | 'load-svg'
  | 'layout-open'
  | 'layout-save-as'
  | 'plotter'
  | 'project-open'
  | 'project-new'
  | 'project-rename'
  | null
type PanelTab = 'drawing' | 'wells' | 'colors' | 'paint'

const DEFAULT_PROJECT = 'default'
const LAST_PROJECT_KEY = 'paint-plotter.last-project'

// The last opened project is remembered per browser (convenience only).
function lastProject(): string {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) || DEFAULT_PROJECT
  } catch {
    return DEFAULT_PROJECT
  }
}
function rememberProject(name: string) {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, name)
  } catch {
    // storage unavailable
  }
}

/** Settings from older saves may lack newer fields. */
const withDefaults = (s: Partial<PaintSettings>): PaintSettings => ({
  ...DEFAULT_PAINT_SETTINGS,
  ...s,
  fill: { ...DEFAULT_PAINT_SETTINGS.fill, ...s.fill },
  dip: { ...DEFAULT_PAINT_SETTINGS.dip, ...s.dip },
})

/** The saved form of the project (also used to detect unsaved changes). */
const projectJsonOf = (p: Omit<Project, 'updated'>) => JSON.stringify({ ...p, hidden_layers: [...p.hidden_layers].sort() })

export default function App() {
  const { message } = AntApp.useApp()
  const [config, setConfig] = useState<PlotterConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [tab, setTab] = useState<PanelTab>('drawing')

  // Drawing
  const [drawing, setDrawing] = useState<SvgDrawing | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  // Well layout
  const [layout, setLayout] = useState<WellLayout>(newLayout)
  // Layout as of the last New / Open / Save, to show unsaved changes.
  const [cleanJson, setCleanJson] = useState(() => JSON.stringify(newLayout()))
  const [savedNames, setSavedNames] = useState<string[]>([])
  const [layoutWarnings, setLayoutWarnings] = useState<string[]>([])
  const [selectedWell, setSelectedWell] = useState<string | null>(null)

  // Color → well mapping
  const [colorChoices, setColorChoices] = useState<ColorChoices>({})
  const [colorMatches, setColorMatches] = useState<ColorMatch[]>([])
  const [previewPaint, setPreviewPaint] = useState(false)

  // Painting
  const [paintSettings, setPaintSettings] = useState<PaintSettings>(DEFAULT_PAINT_SETTINGS)
  const [plan, setPlan] = useState<PaintPlan | null>(null)
  const [planJson, setPlanJson] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [showToolpaths, setShowToolpaths] = useState(true)

  // Project (autosaved to data/projects/<name>/)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [savedProjectJson, setSavedProjectJson] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [renameSuggestion, setRenameSuggestion] = useState<string | null>(null)

  const projectJson = useMemo(
    () =>
      projectName &&
      projectJsonOf({
        name: projectName,
        svg_filename: fileName,
        placement,
        hidden_layers: [...hidden],
        color_choices: colorChoices,
        paint_settings: paintSettings,
        layout,
      }),
    [projectName, fileName, placement, hidden, colorChoices, paintSettings, layout],
  )
  const projectDirty = !!projectJson && projectJson !== savedProjectJson

  const layoutDirty = cleanJson !== JSON.stringify(layout)

  useEffect(() => {
    fetchConfig().then(setConfig, (e: Error) => setError(e.message))
    listWellLayouts().then(setSavedNames, () => {})
  }, [])

  /** Puts a loaded project into the editor state. */
  const applyProject = ({ project: p, drawing: d }: ProjectData) => {
    const settings = withDefaults(p.paint_settings)
    setProjectName(p.name)
    setDrawing(d)
    setFileName(p.svg_filename)
    setPlacement(p.placement)
    setHidden(new Set(p.hidden_layers))
    setColorChoices(p.color_choices)
    setColorMatches([])
    setPaintSettings(settings)
    setLayout(p.layout)
    setCleanJson(JSON.stringify(p.layout))
    setSelectedWell(null)
    setPlan(null)
    setSavedProjectJson(projectJsonOf({ ...p, paint_settings: settings }))
    setSaveError(null)
    rememberProject(p.name)
  }

  /** Opens a project; falls back to (and if needed creates) the default project. */
  const openProject = async (name: string) => {
    try {
      applyProject(await getProject(name))
      return true
    } catch (e) {
      if (!(e instanceof NotFoundError)) message.error((e as Error).message)
      if (name === DEFAULT_PROJECT) {
        try {
          applyProject(await createProject(DEFAULT_PROJECT))
        } catch {
          // Created meanwhile (e.g. by another tab): load it.
          await run(async () => applyProject(await getProject(DEFAULT_PROJECT)))
        }
      } else {
        message.warning(`Project '${name}' not found, opening '${DEFAULT_PROJECT}'`)
        await openProject(DEFAULT_PROJECT)
      }
      return false
    }
  }

  // On start: open the last project (once, also under StrictMode's double effects).
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    openProject(lastProject())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave shortly after each change.
  useEffect(() => {
    if (!projectJson || projectJson === savedProjectJson) return
    const t = setTimeout(async () => {
      setSaving(true)
      try {
        await saveProject(JSON.parse(projectJson) as Project)
        setSavedProjectJson(projectJson)
        setSaveError(null)
      } catch (e) {
        setSaveError((e as Error).message)
      } finally {
        setSaving(false)
      }
    }, 800)
    return () => clearTimeout(t)
  }, [projectJson, savedProjectJson])

  const refreshProjects = () => listProjects().then(setProjects, () => {})

  // Re-check the layout on the backend shortly after each edit.
  useEffect(() => {
    const t = setTimeout(() => {
      checkWellLayout(layout).then(
        (r) => setLayoutWarnings(r.warnings),
        () => setLayoutWarnings([]), // invalid while editing (e.g. empty field) - ignore
      )
    }, 250)
    return () => clearTimeout(t)
  }, [layout])

  const drawingColors = useMemo(() => [...new Set(drawing?.layers.map((l) => l.color) ?? [])], [drawing])

  // Distances from every drawing color to every well (for auto-matching and the dropdowns).
  useEffect(() => {
    if (drawingColors.length === 0) return
    const t = setTimeout(() => {
      matchColors(drawingColors, layout.wells).then(setColorMatches, () => {})
    }, 250)
    return () => clearTimeout(t)
  }, [drawingColors, layout.wells])

  const colorMap = useMemo(
    () => resolveColorMap(drawingColors, colorChoices, colorMatches, layout.wells),
    [drawingColors, colorChoices, colorMatches, layout.wells],
  )
  const wellColor = useMemo(() => new Map(layout.wells.map((w) => [w.id, w.color])), [layout.wells])

  // What gets painted: visible layers, placed, with the color → well mapping.
  const paintRequest: PaintRequest | null = useMemo(
    () =>
      drawing && {
        layers: drawing.layers.filter((l) => !hidden.has(l.id)),
        placement,
        layout,
        color_map: colorMap,
        settings: paintSettings,
        project_name: projectName,
      },
    [drawing, hidden, placement, layout, colorMap, paintSettings, projectName],
  )
  const paintRequestJson = useMemo(() => (paintRequest ? JSON.stringify(paintRequest) : null), [paintRequest])
  const cannotPaint = !drawing
    ? 'Load an SVG first'
    : layout.wells.length === 0
      ? 'Create wells first (Wells tab)'
      : !drawingColors.some((c) => colorMap[c])
        ? 'Assign at least one color to a well (Colors tab)'
        : null
  const bed: Rect | null = config && {
    x: 0,
    y: 0,
    width_mm: config.work_area.width_mm,
    height_mm: config.work_area.height_mm,
  }

  /** Runs an async action and shows its error (and optional success) as a message. */
  const run = async <T,>(action: () => Promise<T>, ok?: (r: T) => string): Promise<T | undefined> => {
    try {
      const r = await action()
      if (ok) message.success(ok(r))
      return r
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const loadSvg = async (file: File) => {
    if (!projectName) return false
    const data = await run(() => uploadProjectSvg(projectName, file))
    if (!data) return false
    setDrawing(data.drawing)
    setFileName(data.project.svg_filename)
    setPlacement(DEFAULT_PLACEMENT)
    setHidden(new Set())
    setColorChoices({})
    setColorMatches([])
    setPlan(null)
    setTab('drawing')
    if (projectName === DEFAULT_PROJECT) {
      // Nudge: give the project a real name, suggested from the file name.
      setRenameSuggestion(file.name.replace(/\.svg$/i, ''))
      refreshProjects()
      setTimeout(() => setDialog('project-rename'), 300)
    }
    return true
  }

  const newProject = async (name: string) => {
    const created = await run(() => createProject(name), () => `Created project '${name}'`)
    if (created) {
      applyProject(created)
      setDialog(null)
      setTab('drawing')
    }
  }

  const rename = async (name: string) => {
    if (!projectName) return
    const p = await run(() => renameProject(projectName, name), () => `Renamed to '${name}'`)
    if (p) {
      setProjectName(p.name) // autosave writes under the new name
      rememberProject(p.name)
      setDialog(null)
      refreshProjects()
    }
  }

  const removeProject = async (name: string) => {
    if (!(await run(() => deleteProject(name), () => `Deleted project '${name}'`))) return
    refreshProjects()
    if (name === projectName) {
      setProjectName(null) // stop autosave for the deleted project
      setDialog(null)
      await openProject(DEFAULT_PROJECT)
    }
  }

  const openLayout = async (name: string) => {
    const l = await run(() => getWellLayout(name))
    if (!l) return
    setLayout(l)
    setCleanJson(JSON.stringify(l))
    setSelectedWell(null)
    setDialog(null)
    setTab('wells')
  }

  const saveLayout = async (name: string) => {
    const l = { ...layout, name }
    if (await run(() => saveWellLayout(l), () => `Saved layout '${name}'`)) {
      setLayout(l)
      setCleanJson(JSON.stringify(l))
      setDialog(null)
      listWellLayouts().then(setSavedNames, () => {})
    }
  }

  const removeLayout = async (name: string) => {
    if (await run(() => deleteWellLayout(name), () => `Deleted '${name}'`)) {
      listWellLayouts().then(setSavedNames, () => {})
    }
  }

  const arrange = async () => {
    const l = await run(
      () => arrangeWellLayout(layout, drawingColors, drawing && placedRect(drawing, placement)),
      (r) => `Arranged ${r.wells.length} crosses`,
    )
    if (l) {
      setLayout(l)
      setSelectedWell(null)
    }
  }

  const generate = async () => {
    if (!paintRequest) return
    setGenerating(true)
    const p = await run(() => planPainting(paintRequest))
    setGenerating(false)
    if (p) {
      setPlan(p)
      setPlanJson(paintRequestJson)
      setShowToolpaths(true)
    }
  }

  const downloadZip = () => {
    if (cannotPaint || !paintRequest) return message.warning(cannotPaint ?? 'Nothing to export')
    return run(() => downloadPaintingZip(paintRequest), (f) => `Downloaded ${f}`)
  }

  const onMenu = (action: MenuAction) => {
    switch (action) {
      case 'load-svg':
        return setDialog('load-svg')
      case 'project-new':
        refreshProjects()
        return setDialog('project-new')
      case 'project-open':
        refreshProjects()
        return setDialog('project-open')
      case 'project-rename':
        refreshProjects()
        setRenameSuggestion(null)
        return setDialog('project-rename')
      case 'layout-new':
        setLayout(newLayout())
        setCleanJson(JSON.stringify(newLayout()))
        setSelectedWell(null)
        return setTab('wells')
      case 'layout-open':
        listWellLayouts().then(setSavedNames, () => {})
        return setDialog('layout-open')
      case 'layout-save':
        return savedNames.includes(layout.name) ? saveLayout(layout.name) : setDialog('layout-save-as')
      case 'layout-save-as':
        return setDialog('layout-save-as')
      case 'export-pencil':
        return run(() => downloadWellLayoutGcode(layout), (f) => `Downloaded ${f}`)
      case 'export-zip':
        return downloadZip()
      case 'plotter-settings':
        return setDialog('plotter')
    }
  }

  const selectWell = (id: string | null) => {
    setSelectedWell(id)
    if (id) setTab('wells')
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 24, paddingInline: 16 }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0, whiteSpace: 'nowrap' }}>
          Paint Plotter
        </Typography.Title>
        <AppMenu onAction={onMenu} />
        <Flex gap={4}>
          {projectName && (
            <Tooltip
              title={
                projectName === DEFAULT_PROJECT
                  ? 'Give this project its own name (click, or File → Rename project…)'
                  : 'Rename project'
              }
            >
              <Tag
                icon={<FolderOutlined />}
                color={projectName === DEFAULT_PROJECT ? 'warning' : 'processing'}
                style={{ cursor: 'pointer' }}
                onClick={() => onMenu('project-rename')}
              >
                {projectName}
              </Tag>
            </Tooltip>
          )}
          {fileName && <Tag icon={<PictureOutlined />}>{fileName}</Tag>}
          <Tag icon={<BgColorsOutlined />}>
            {layout.name}
            {layoutDirty && ' •'}
          </Tag>
        </Flex>
      </Header>

      <Layout style={{ flex: 1, minHeight: 0 }}>
        <Sider width={380} theme="light" style={{ overflowY: 'auto', borderRight: '1px solid #0000000f' }}>
          {config && bed && (
            <Tabs
              activeKey={tab}
              onChange={(k) => setTab(k as PanelTab)}
              tabBarStyle={{ paddingInline: 16, marginBottom: 12 }}
              style={{ paddingBottom: 16 }}
              items={[
                {
                  key: 'drawing',
                  label: 'Drawing',
                  icon: <PictureOutlined />,
                  children: (
                    <div style={{ paddingInline: 12 }}>
                      <DrawingPanel
                        drawing={drawing}
                        onLoadClick={() => setDialog('load-svg')}
                        placement={placement}
                        onPlacementChange={setPlacement}
                        hidden={hidden}
                        onToggleLayer={(id, visible) =>
                          setHidden((prev) => {
                            const next = new Set(prev)
                            if (visible) next.delete(id)
                            else next.add(id)
                            return next
                          })
                        }
                        area={bed}
                      />
                    </div>
                  ),
                },
                {
                  key: 'colors',
                  label: 'Colors',
                  icon: <NodeIndexOutlined />,
                  children: (
                    <div style={{ paddingInline: 12 }}>
                      <ColorsPanel
                        colors={drawingColors}
                        layers={drawing?.layers ?? []}
                        wells={layout.wells}
                        matches={colorMatches}
                        choices={colorChoices}
                        onChoicesChange={setColorChoices}
                        resolved={colorMap}
                        previewPaint={previewPaint}
                        onPreviewPaintChange={setPreviewPaint}
                      />
                    </div>
                  ),
                },
                {
                  key: 'paint',
                  label: 'Paint',
                  icon: <HighlightOutlined />,
                  children: (
                    <div style={{ paddingInline: 12 }}>
                      <PaintPanel
                        settings={paintSettings}
                        onSettingsChange={setPaintSettings}
                        plan={plan}
                        planOutdated={!!plan && planJson !== paintRequestJson}
                        generating={generating}
                        canGenerate={cannotPaint}
                        onGenerate={generate}
                        onDownloadZip={downloadZip}
                        onDownloadPencil={() =>
                          run(() => downloadWellLayoutGcode(layout), (f) => `Downloaded ${f}`)
                        }
                        getPencilGcode={() => wellLayoutGcodeText(layout)}
                        hasWells={layout.wells.length > 0}
                        showToolpaths={showToolpaths}
                        onShowToolpathsChange={setShowToolpaths}
                      />
                    </div>
                  ),
                },
                {
                  key: 'wells',
                  label: 'Wells',
                  icon: <BgColorsOutlined />,
                  children: (
                    <div style={{ paddingInline: 12 }}>
                      <WellsPanel
                        layout={layout}
                        onChange={setLayout}
                        warnings={layoutWarnings}
                        selectedId={selectedWell}
                        onSelect={selectWell}
                        drawingColors={drawingColors}
                        onArrange={arrange}
                      />
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Sider>

        <Content style={{ position: 'relative', background: '#f5f5f5' }}>
          {error && (
            <Alert style={{ margin: 16 }} type="error" showIcon title="Backend not reachable" description={error} />
          )}
          {!config && !error && <Spin style={{ margin: 32 }} />}
          {config && (
            <div style={{ position: 'absolute', inset: 16 }}>
              <Bed widthMm={config.work_area.width_mm} heightMm={config.work_area.height_mm}>
                <WellsView layout={layout} selectedId={selectedWell} onSelect={selectWell} />
                {drawing && (
                  <g opacity={plan && showToolpaths && tab === 'paint' ? 0.2 : 1}>
                    <DrawingView
                      drawing={drawing}
                      placement={placement}
                      hidden={hidden}
                      colorFor={
                        previewPaint
                          ? (l) => {
                              const id = colorMap[l.color]
                              return id ? (wellColor.get(id) ?? null) : null
                            }
                          : undefined
                      }
                    />
                  </g>
                )}
                {plan && showToolpaths && tab === 'paint' && (
                  <ToolpathView plan={plan} brushWidth={paintSettings.brush_width_mm} />
                )}
              </Bed>
            </div>
          )}
        </Content>
      </Layout>

      <StatusBar
        projectName={projectName}
        saveState={saveError ? 'error' : saving ? 'saving' : projectDirty ? 'pending' : 'saved'}
        saveError={saveError}
        fileName={fileName}
        scale={drawing ? placement.scale : null}
        layoutName={layout.name}
        layoutDirty={layoutDirty}
        warningCount={layoutWarnings.length}
        colorsAssigned={drawing ? [drawingColors.filter((c) => colorMap[c]).length, drawingColors.length] : null}
        workArea={config ? `${config.work_area.width_mm} × ${config.work_area.height_mm} mm` : '–'}
      />

      <LoadSvgModal open={dialog === 'load-svg'} onClose={() => setDialog(null)} onLoad={loadSvg} />
      <OpenProjectModal
        open={dialog === 'project-open'}
        projects={projects}
        current={projectName}
        onClose={() => setDialog(null)}
        onOpen={async (name) => {
          if (await openProject(name)) setDialog(null)
        }}
        onDelete={removeProject}
      />
      <ProjectNameModal
        key={dialog === 'project-new' ? 'new-open' : 'new-closed'}
        open={dialog === 'project-new'}
        title="New project"
        okText="Create"
        initialName=""
        taken={projects.map((p) => p.name)}
        hint="A project keeps the SVG, its placement, wells, color choices and paint settings. It is saved automatically in data/projects/."
        onClose={() => setDialog(null)}
        onOk={newProject}
      />
      <ProjectNameModal
        key={dialog === 'project-rename' ? `rename-${renameSuggestion ?? projectName}` : 'rename-closed'}
        open={dialog === 'project-rename'}
        title="Rename project"
        okText="Rename"
        initialName={renameSuggestion ?? projectName ?? ''}
        taken={projects.map((p) => p.name).filter((n) => n !== projectName)}
        hint={
          projectName === DEFAULT_PROJECT
            ? `This project is still called '${DEFAULT_PROJECT}'. Give it its own name so it is easy to find again.`
            : undefined
        }
        onClose={() => setDialog(null)}
        onOk={rename}
      />
      <OpenLayoutModal
        open={dialog === 'layout-open'}
        saved={savedNames}
        onClose={() => setDialog(null)}
        onOpen={openLayout}
        onDelete={removeLayout}
      />
      <SaveLayoutModal
        key={dialog === 'layout-save-as' ? `save-${layout.name}` : 'save-closed'}
        open={dialog === 'layout-save-as'}
        initialName={layout.name}
        saved={savedNames}
        onClose={() => setDialog(null)}
        onSave={saveLayout}
      />
      {config && <PlotterDrawer open={dialog === 'plotter'} onClose={() => setDialog(null)} config={config} />}
    </Layout>
  )
}
