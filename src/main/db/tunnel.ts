import { Client, type ConnectConfig } from 'ssh2'
import { createServer } from 'net'
import { readFileSync } from 'fs'
import type { ConnectionConfig, SshConfig } from '../../shared/types'

/** Build the ssh2 auth options for the configured method. */
function authOptions(ssh: SshConfig): ConnectConfig {
  const method = ssh.authMethod ?? (ssh.privateKey ? 'key' : 'password')
  if (method === 'agent') {
    const agent =
      process.env.SSH_AUTH_SOCK || (process.platform === 'win32' ? 'pageant' : undefined)
    if (!agent) throw new Error('No SSH agent available (SSH_AUTH_SOCK is not set)')
    return { agent }
  }
  if (method === 'key') {
    if (!ssh.privateKey) throw new Error('SSH private key file is required')
    return { privateKey: readFileSync(ssh.privateKey), passphrase: ssh.passphrase || undefined }
  }
  return { password: ssh.password || undefined }
}

export interface Tunnel {
  /** Local endpoint the driver should connect to. */
  host: string
  port: number
  close: () => void
}

/**
 * Open an SSH connection and forward an ephemeral local port to `dstHost:dstPort`
 * as reachable from the SSH server. The driver then connects to the returned
 * local endpoint, transparently tunneling its traffic over SSH.
 */
export async function openTunnel(
  config: ConnectionConfig,
  dstHost: string,
  dstPort: number
): Promise<Tunnel> {
  const ssh = config.ssh
  if (!ssh?.enabled) throw new Error('SSH tunnel is not enabled')
  if (!ssh.host) throw new Error('SSH host is required')

  const client = new Client()
  await new Promise<void>((resolve, reject) => {
    client.once('ready', resolve)
    client.once('error', reject)
    client.connect({
      host: ssh.host,
      port: ssh.port || 22,
      username: ssh.user || undefined,
      readyTimeout: 20000,
      ...authOptions(ssh)
    })
  })

  const server = createServer((socket) => {
    client.forwardOut(
      socket.remoteAddress || '127.0.0.1',
      socket.remotePort || 0,
      dstHost,
      dstPort,
      (err, stream) => {
        if (err) {
          socket.destroy()
          return
        }
        socket.pipe(stream).pipe(socket)
        stream.on('error', () => socket.destroy())
        socket.on('error', () => stream.destroy())
      }
    )
  })

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') resolve(addr.port)
      else reject(new Error('Failed to allocate a local tunnel port'))
    })
  })

  // If the SSH connection drops, tear down the local listener too.
  client.on('close', () => server.close())

  return {
    host: '127.0.0.1',
    port,
    close: () => {
      server.close()
      client.end()
    }
  }
}
