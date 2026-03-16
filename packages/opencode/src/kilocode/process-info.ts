// kilocode_change - new file
import z from "zod"
import { Log } from "../util/log"

export namespace ProcessInfo {
  const log = Log.create({ service: "process-info" })

  export const Info = z
    .object({
      pid: z.number(),
      ppid: z.number(),
      rss: z.number(),
      command: z.string(),
      args: z.string(),
    })
    .meta({
      ref: "ProcessInfo",
    })
  export type Info = z.infer<typeof Info>

  export const Status = z
    .object({
      self: Info,
      heap: z.object({
        used: z.number(),
        total: z.number(),
        external: z.number(),
        buffers: z.number(),
      }),
      children: z.array(Info),
    })
    .meta({
      ref: "ProcessStatus",
    })
  export type Status = z.infer<typeof Status>

  function format(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB"
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB"
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB"
    return bytes + " B"
  }

  export function pretty(info: Info): string {
    return `PID ${info.pid} | ${format(info.rss)} | ${info.command} ${info.args}`.trim()
  }

  export function formatBytes(bytes: number): string {
    return format(bytes)
  }

  async function descendants(pid: number): Promise<number[]> {
    if (process.platform === "win32") return []
    const pids: number[] = []
    const queue = [pid]
    while (queue.length > 0) {
      const current = queue.shift()!
      const proc = Bun.spawn(["pgrep", "-P", String(current)], { stdout: "pipe", stderr: "pipe" })
      const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]).catch(
        () => [-1, ""] as const,
      )
      if (code !== 0) continue
      for (const tok of out.trim().split(/\s+/)) {
        const cpid = parseInt(tok, 10)
        if (!isNaN(cpid) && pids.indexOf(cpid) === -1) {
          pids.push(cpid)
          queue.push(cpid)
        }
      }
    }
    return pids
  }

  async function info(pid: number): Promise<Info | undefined> {
    if (process.platform === "win32") return undefined
    // ucomm gives the short executable name (e.g. "node", "bun")
    // comm on macOS is an alias for command (full path + args) which breaks whitespace parsing
    const proc = Bun.spawn(["ps", "-p", String(pid), "-o", "pid=,ppid=,rss=,ucomm=,args="], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]).catch(
      () => [-1, ""] as const,
    )
    if (code !== 0) return undefined
    const line = out.trim()
    if (!line) return undefined
    // ps output: PID PPID RSS UCOMM ARGS...
    // RSS is in KB from ps, ucomm is a single word (executable basename)
    const parts = line.trim().split(/\s+/)
    if (parts.length < 4) return undefined
    const parsed = {
      pid: parseInt(parts[0], 10),
      ppid: parseInt(parts[1], 10),
      rss: parseInt(parts[2], 10) * 1024, // convert KB to bytes
      command: parts[3],
      args: parts.slice(4).join(" "),
    }
    if (isNaN(parsed.pid)) return undefined
    return parsed
  }

  export async function status(): Promise<Status> {
    const pid = process.pid
    const mem = process.memoryUsage()

    const self = (await info(pid)) ?? {
      pid,
      ppid: process.ppid,
      rss: mem.rss,
      command: process.argv0,
      args: process.argv.slice(1).join(" "),
    }

    const cpids = await descendants(pid)
    const results = await Promise.all(cpids.map((p) => info(p).catch(() => undefined)))
    const children = results.filter((x): x is Info => x !== undefined)

    log.info("process status", {
      self: self.pid,
      rss: format(self.rss),
      heap: format(mem.heapUsed),
      children: children.length,
    })

    return {
      self,
      heap: {
        used: mem.heapUsed,
        total: mem.heapTotal,
        external: mem.external,
        buffers: mem.arrayBuffers,
      },
      children,
    }
  }
}
