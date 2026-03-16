// kilocode_change - new file
// Lightweight TypeScript diagnostic client that shells out to tsgo/tsc
// instead of spawning a persistent typescript-language-server process.
// This drops memory from ~500MB persistent to ~50MB peak (0 idle).

import type { LSPClient } from "../lsp/client"
import { TsCheck } from "./ts-check"
import { Log } from "../util/log"
import { Filesystem } from "../util/filesystem"
import path from "path"
import { Instance } from "../project/instance"

export namespace TsClient {
  const log = Log.create({ service: "ts-client" })

  export function create(input: { root: string }): LSPClient.Info {
    const diagnostics = new Map<string, LSPClient.Diagnostic[]>()
    // Track files we've seen to replicate the first-publish suppression
    // from client.ts:60 — skip the first Bus publish for unseen files.
    // Since we compute diagnostics synchronously on notify.open, we don't
    // use Bus at all; instead waitForDiagnostics resolves immediately.
    let pending: Promise<void> | undefined

    const client: LSPClient.Info = {
      root: input.root,
      get serverID() {
        return "typescript"
      },
      get connection(): any {
        // LSP namespace methods (hover, definition, etc.) call
        // connection.sendRequest() directly. Provide a stub that
        // rejects so those code paths surface a clear error instead
        // of crashing with "cannot read property sendRequest of undefined".
        return {
          sendRequest() {
            return Promise.reject(
              new Error("TypeScript LSP operations are not supported in lightweight diagnostic mode"),
            )
          },
          sendNotification() {
            return Promise.resolve()
          },
        }
      },
      notify: {
        async open(input: { path: string }) {
          const abs = path.isAbsolute(input.path) ? input.path : path.resolve(Instance.directory, input.path)
          log.info("notify.open (queuing tsgo)", { path: abs })

          // Run a full project check. Multiple rapid calls are coalesced:
          // we store the promise and reuse it until it settles.
          if (!pending) {
            pending = TsCheck.run(client.root)
              .then((result) => {
                // Replace the entire diagnostics map with fresh results
                diagnostics.clear()
                for (const [file, diags] of result) {
                  diagnostics.set(file, diags)
                }
                pending = undefined
              })
              .catch((err) => {
                log.error("ts check failed", { error: err })
                pending = undefined
              })
          }
          await pending
        },
      },
      get diagnostics() {
        return diagnostics
      },
      async waitForDiagnostics(_input: { path: string }) {
        // Diagnostics are computed synchronously during notify.open.
        // If there's a pending run, wait for it; otherwise resolve immediately.
        if (pending) await pending
      },
      async shutdown() {
        log.info("shutting down ts-client")
        diagnostics.clear()
      },
    }

    log.info("created lightweight ts client", { root: input.root })
    return client
  }
}
