import { useEffect, useMemo, useState } from 'react'
import { Alert, App as AntApp, Flex, Layout, Spin, Tabs, Tag, Typography } from 'antd'
import { BgColorsOutlined, HighlightOutlined, NodeIndexOutlined, PictureOutlined } from '@ant-design/icons'
import {
  DEFAULT_PAINT_SETTINGS,
  arrangeWellLayout,
  checkWellLayout,
  deleteWellLayout,
  downloadPaintingZip,
  downloadWellLayoutGcode,
  fetchConfig,
  getWellLayout,
  listWellLayouts,
  matchColors,
  planPainting,
  saveWellLayout,
  uploadSvg,
  type ColorMatch,
  type PaintPlan,
  type PaintRequest,
  type PaintSettings,
  type PlotterConfig,
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
import StatusBar from './components/StatusBar'
import ToolpathView from './components/ToolpathView'
import WellsPanel from './components/WellsPanel'
import WellsView from './components/WellsView'
import { DEFAULT_PLACEMENT, placedRect, type Placement } from './placement'

const { Header, Sider, Content } = Layout

const newLayout = (): WellLayout => ({ name: 'untitled', palette: null, margin_mm: 5, wells: [] })

type Dialog = 'load-svg' | 'layout-open' | 'layout-save-as' | 'plotter' | null
type PanelTab = 'drawing' | 'wells' | 'colors' | 'paint'

const SETTINGS_KEY = 'paint-plotter.paint-settings'

/** Paint settings are remembered per browser (convenience only; falls back to defaults). */
function loadPaintSettings(): PaintSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<PaintSettings>
      return {
        ...DEFAULT_PAINT_SETTINGS,
        ...s,
        fill: { ...DEFAULT_PAINT_SETTINGS.fill, ...s.fill },
        dip: { ...DEFAULT_PAINT_SETTINGS.dip, ...s.dip },
      }
    }
  } catch {
    // storage unavailable or corrupt
  }
  return DEFAULT_PAINT_SETTINGS
}

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
  const [paintSettings, setPaintSettings] = useState<PaintSettings>(loadPaintSettings)
  const [plan, setPlan] = useState<PaintPlan | null>(null)
  const [planJson, setPlanJson] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [showToolpaths, setShowToolpaths] = useState(true)

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(paintSettings))
    } catch {
      // ignore
    }
  }, [paintSettings])

  const layoutDirty = cleanJson !== JSON.stringify(layout)

  useEffect(() => {
    fetchConfig().then(setConfig, (e: Error) => setError(e.message))
    listWellLayouts().then(setSavedNames, () => {})
  }, [])

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
      },
    [drawing, hidden, placement, layout, colorMap, paintSettings],
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
    const d = await run(() => uploadSvg(file))
    if (!d) return false
    setDrawing(d)
    setFileName(file.name)
    setPlacement(DEFAULT_PLACEMENT)
    setHidden(new Set())
    setColorChoices({})
    setColorMatches([])
    setPlan(null)
    setTab('drawing')
    return true
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
        fileName={fileName}
        scale={drawing ? placement.scale : null}
        layoutName={layout.name}
        layoutDirty={layoutDirty}
        warningCount={layoutWarnings.length}
        colorsAssigned={drawing ? [drawingColors.filter((c) => colorMap[c]).length, drawingColors.length] : null}
        workArea={config ? `${config.work_area.width_mm} × ${config.work_area.height_mm} mm` : '–'}
      />

      <LoadSvgModal open={dialog === 'load-svg'} onClose={() => setDialog(null)} onLoad={loadSvg} />
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
