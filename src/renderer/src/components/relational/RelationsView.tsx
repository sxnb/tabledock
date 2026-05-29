import { useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  Handle,
  Position,
  MarkerType,
  type Node,
  type NodeProps,
  type Edge,
  type NodeTypes
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { Table2, KeyRound, Link2, RefreshCw, Workflow } from 'lucide-react'
import type { SchemaColumn, SchemaGraph, SchemaTable } from '@shared/types'
import { Spinner } from '@renderer/components/ui/Spinner'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { IconButton } from '@renderer/components/ui/IconButton'
import { cn } from '@renderer/lib/cn'

const NODE_W = 252
const HEADER_H = 38
const ROW_H = 26
const ACCENT = '#8b7bff'

interface TableNodeData extends Record<string, unknown> {
  table: SchemaTable
  sourceCols: string[]
  targetCols: string[]
}
type TableFlowNode = Node<TableNodeData, 'table'>

const handleStyle = {
  width: 8,
  height: 8,
  background: ACCENT,
  border: '1.5px solid var(--color-surface-2)'
}

function TableNode({ data }: NodeProps<TableFlowNode>): React.JSX.Element {
  const { table, sourceCols, targetCols } = data
  const sSet = new Set(sourceCols)
  const tSet = new Set(targetCols)
  return (
    <div
      className="overflow-hidden rounded-lg border border-border-strong bg-surface-2 shadow-2xl"
      style={{ width: NODE_W }}
    >
      <div
        className="flex items-center gap-1.5 border-b border-border-strong bg-surface-3 px-3"
        style={{ height: HEADER_H }}
      >
        <Table2 size={13} className="shrink-0 text-accent" />
        <span className="truncate font-mono text-xs font-semibold text-text">{table.name}</span>
      </div>
      <div>
        {table.columns.map((col) => (
          <ColumnRow
            key={col.name}
            column={col}
            hasTarget={tSet.has(col.name)}
            hasSource={sSet.has(col.name)}
          />
        ))}
      </div>
    </div>
  )
}

function ColumnRow({
  column,
  hasTarget,
  hasSource
}: {
  column: SchemaColumn
  hasTarget: boolean
  hasSource: boolean
}): React.JSX.Element {
  return (
    <div
      className="relative flex items-center gap-2 border-b border-border/50 px-3 font-mono text-[11px] last:border-b-0"
      style={{ height: ROW_H }}
    >
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          id={`t:${column.name}`}
          style={handleStyle}
        />
      )}
      {hasSource && (
        <Handle
          type="source"
          position={Position.Right}
          id={`s:${column.name}`}
          style={handleStyle}
        />
      )}
      <span
        className={cn('truncate', column.isPrimaryKey ? 'font-semibold text-accent' : 'text-text')}
      >
        {column.name}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1 text-faint">
        {column.isPrimaryKey && <KeyRound size={10} className="text-accent" />}
        {column.isForeignKey && <Link2 size={10} className="text-blue" />}
        <span className="text-[10px] uppercase">{column.dataType}</span>
      </span>
    </div>
  )
}

const nodeTypes: NodeTypes = { table: TableNode }

/** Build positioned React Flow nodes/edges from a schema graph via dagre. */
function buildFlow(graph: SchemaGraph): { nodes: TableFlowNode[]; edges: Edge[] } {
  const tableMap = new Map(graph.tables.map((t) => [t.name, t]))
  const sourceCols = new Map<string, Set<string>>()
  const targetCols = new Map<string, Set<string>>()
  const add = (map: Map<string, Set<string>>, table: string, col: string): void => {
    const set = map.get(table) ?? new Set<string>()
    set.add(col)
    map.set(table, set)
  }

  const edges: Edge[] = []
  for (const rel of graph.relations) {
    const src = tableMap.get(rel.sourceTable)
    const tgt = tableMap.get(rel.targetTable)
    if (!src || !tgt) continue
    if (!src.columns.some((c) => c.name === rel.sourceColumn)) continue
    if (!tgt.columns.some((c) => c.name === rel.targetColumn)) continue
    add(sourceCols, rel.sourceTable, rel.sourceColumn)
    add(targetCols, rel.targetTable, rel.targetColumn)
    edges.push({
      id: rel.id,
      source: rel.sourceTable,
      target: rel.targetTable,
      sourceHandle: `s:${rel.sourceColumn}`,
      targetHandle: `t:${rel.targetColumn}`,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: ACCENT, width: 16, height: 16 },
      style: { stroke: ACCENT, strokeWidth: 1.5 }
    })
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 96, marginx: 24, marginy: 24 })
  for (const t of graph.tables) {
    g.setNode(t.name, { width: NODE_W, height: HEADER_H + t.columns.length * ROW_H })
  }
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)

  const nodes: TableFlowNode[] = graph.tables.map((t) => {
    const node = g.node(t.name)
    const height = HEADER_H + t.columns.length * ROW_H
    return {
      id: t.name,
      type: 'table',
      position: { x: node.x - NODE_W / 2, y: node.y - height / 2 },
      data: {
        table: t,
        sourceCols: [...(sourceCols.get(t.name) ?? [])],
        targetCols: [...(targetCols.get(t.name) ?? [])]
      }
    }
  })
  return { nodes, edges }
}

interface RelationsViewProps {
  sessionId: string
  database?: string
}

export function RelationsView({ sessionId, database }: RelationsViewProps): React.JSX.Element {
  const [graph, setGraph] = useState<SchemaGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- schema fetch sets loading/graph intentionally
    setLoading(true)
    setError(null)
    window.api.db
      .schemaGraph(sessionId, database)
      .then((g) => {
        if (!cancelled) setGraph(g)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, database, reloadKey])

  const flow = useMemo(() => (graph ? buildFlow(graph) : { nodes: [], edges: [] }), [graph])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={20} />
      </div>
    )
  }
  if (error) {
    return <EmptyState title="Couldn't load schema" description={error} />
  }
  if (!graph || graph.tables.length === 0) {
    return (
      <EmptyState
        icon={<Workflow size={28} />}
        title="No tables to diagram"
        description="This database has no tables yet."
      />
    )
  }

  return (
    <div className="h-full w-full bg-bg">
      <ReactFlow
        key={`${database ?? 'db'}-${reloadKey}`}
        defaultNodes={flow.nodes}
        defaultEdges={flow.edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#262a3d" gap={22} size={1} />
        <Controls showInteractive={false} />
        <Panel
          position="top-left"
          className="flex items-center gap-2 rounded-md border border-border bg-surface/90 px-2.5 py-1.5 text-xs text-muted backdrop-blur"
        >
          <Workflow size={13} className="text-accent" />
          <span>
            {graph.tables.length} tables · {graph.relations.length} relations
          </span>
          <IconButton
            label="Reload schema"
            className="h-6 w-6"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            <RefreshCw size={12} />
          </IconButton>
        </Panel>
      </ReactFlow>
    </div>
  )
}
