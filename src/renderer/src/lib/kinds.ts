import { Database, HardDrive, Layers, type LucideIcon } from 'lucide-react'
import type { DriverKind } from '@shared/types'

export interface KindMeta {
  label: string
  /** Short badge shown in lists. */
  badge: string
  icon: LucideIcon
  /** Accent color for the badge/icon. */
  color: string
  defaultPort?: number
  /** Whether this kind is relational (table-oriented). */
  relational: boolean
}

export const KIND_META: Record<DriverKind, KindMeta> = {
  mysql: {
    label: 'MySQL',
    badge: 'SQL',
    icon: Database,
    color: '#5b8cff',
    defaultPort: 3306,
    relational: true
  },
  mariadb: {
    label: 'MariaDB',
    badge: 'MAR',
    icon: Database,
    color: '#9a6a4f',
    defaultPort: 3306,
    relational: true
  },
  postgres: {
    label: 'PostgreSQL',
    badge: 'PG',
    icon: Database,
    color: '#7c93ee',
    defaultPort: 5432,
    relational: true
  },
  mssql: {
    label: 'SQL Server',
    badge: 'MS',
    icon: Database,
    color: '#cc4b4b',
    defaultPort: 1433,
    relational: true
  },
  sqlite: {
    label: 'SQLite',
    badge: 'LITE',
    icon: HardDrive,
    color: '#4ade80',
    relational: true
  },
  redis: {
    label: 'Redis',
    badge: 'KV',
    icon: Layers,
    color: '#ff6b81',
    defaultPort: 6379,
    relational: false
  }
}

export const KIND_ORDER: DriverKind[] = ['mysql', 'mariadb', 'postgres', 'mssql', 'redis', 'sqlite']
