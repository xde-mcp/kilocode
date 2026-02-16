import { NavSection } from "../types"

export const TroubleshootingNav: NavSection[] = [
	{
		title: "Troubleshooting",
		links: [
			{ href: "/troubleshooting", children: "Overview" },
			{ href: "/troubleshooting/troubleshooting-extension", children: "Extension Troubleshooting" },
		],
	},
]
