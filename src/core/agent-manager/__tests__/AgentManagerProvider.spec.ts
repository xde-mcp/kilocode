import { describe, expect, it } from "vitest"

import { getKilocodeCliCandidatePaths } from "../AgentManagerProvider"

describe("getKilocodeCliCandidatePaths", () => {
	it("returns expected POSIX paths", () => {
		const env = { HOME: "/Users/test" } as NodeJS.ProcessEnv
		const paths = getKilocodeCliCandidatePaths(env, "darwin")

		expect(paths).toContain("/opt/homebrew/bin/kilocode")
		expect(paths).toContain("/usr/local/bin/kilocode")
		expect(paths).toContain("/usr/bin/kilocode")
		expect(paths).toContain("/Users/test/.npm-global/bin/kilocode")
		expect(paths).toContain("/Users/test/.local/bin/kilocode")
		expect(paths.some((p) => p.includes("\\kilocode"))).toBe(false)
	})

	it("returns expected Windows paths", () => {
		const env = {
			USERPROFILE: "C:\\Users\\Tester",
			APPDATA: "C:\\Users\\Tester\\AppData\\Roaming",
			LOCALAPPDATA: "C:\\Users\\Tester\\AppData\\Local",
			ProgramFiles: "C:\\Program Files",
			"ProgramFiles(x86)": "C:\\Program Files (x86)",
		} as NodeJS.ProcessEnv

		const paths = getKilocodeCliCandidatePaths(env, "win32")

		expect(paths).toContain("C:\\Users\\Tester\\AppData\\Roaming\\npm\\kilocode.cmd")
		expect(paths).toContain("C:\\Users\\Tester\\AppData\\Local\\Programs\\kilocode\\kilocode.exe")
		expect(paths).toContain("C:\\Program Files\\Kilocode\\kilocode.exe")
		expect(paths).toContain("C:\\Program Files (x86)\\Kilocode\\kilocode.exe")
		expect(paths.some((p) => p.startsWith("/opt/homebrew"))).toBe(false)
	})
})
