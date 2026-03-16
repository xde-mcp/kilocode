// kilocode_change - new file
import type { Diagnostic } from "vscode-languageserver-types"
import { Log } from "../util/log"
import { Filesystem } from "../util/filesystem"
import path from "path"

export namespace TsCheck {
  const log = Log.create({ service: "ts-check" })

  // Match: file(line,col): error TSxxxx: message
  const DIAG_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/

  export async function run(root: string): Promise<Map<string, Diagnostic[]>> {
    const result = new Map<string, Diagnostic[]>()
    const bin = await resolve(root)
    if (!bin) {
      log.info("no typescript checker found", { root })
      return result
    }

    log.info("running ts check", { bin: bin.cmd, root })
    const start = Date.now()

    const proc = Bun.spawn([bin.cmd, "--noEmit", "--pretty", "false"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const code = await proc.exited

    log.info("ts check done", {
      exit: code,
      elapsed: Date.now() - start,
      lines: stdout.split("\n").length,
    })

    if (stderr.trim()) {
      log.info("ts check stderr", { stderr: stderr.slice(0, 500) })
    }

    for (const line of stdout.split("\n")) {
      const m = DIAG_RE.exec(line)
      if (!m) continue

      const [, file, row, col, severity, code, msg] = m
      const abs = path.isAbsolute(file) ? file : path.resolve(root, file)
      const normalized = Filesystem.normalizePath(abs)

      const diag: Diagnostic = {
        range: {
          start: { line: parseInt(row) - 1, character: parseInt(col) - 1 },
          end: { line: parseInt(row) - 1, character: parseInt(col) - 1 },
        },
        severity: severity === "error" ? 1 : 2,
        message: msg,
        source: "ts",
        code,
      }

      const arr = result.get(normalized) ?? []
      arr.push(diag)
      result.set(normalized, arr)
    }

    return result
  }

  async function resolve(root: string): Promise<{ cmd: string } | undefined> {
    // 1. Try local tsgo from node_modules
    const local = path.join(root, "node_modules", ".bin", "tsgo")
    if (await Filesystem.exists(local)) return { cmd: local }

    // 2. Try global tsgo
    const global = Bun.which("tsgo")
    if (global) return { cmd: global }

    // 3. Try local tsc
    const tsc = path.join(root, "node_modules", ".bin", "tsc")
    if (await Filesystem.exists(tsc)) return { cmd: tsc }

    // 4. Try global tsc
    const gtsc = Bun.which("tsc")
    if (gtsc) return { cmd: gtsc }

    return undefined
  }
}
