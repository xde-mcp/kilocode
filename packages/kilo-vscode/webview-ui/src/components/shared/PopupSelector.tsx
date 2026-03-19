/**
 * PopupSelector — a Popover wrapper that automatically fits itself within the
 * underlying panel. Sizing logic is centralised here so any popup-style
 * selector can reuse it without duplicating the measurement code.
 *
 * Usage:
 *   <PopupSelector expanded={expanded()} open={open()} onOpenChange={setOpen} ...>
 *     {(bodyH) => <div style={{ height: `${bodyH()}px` }}>…</div>}
 *   </PopupSelector>
 */

import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  type JSXElement,
  splitProps,
  type ValidComponent,
} from "solid-js"
import { Popover } from "@kilocode/kilo-ui/popover"
import type { PopoverProps } from "@kilocode/kilo-ui/popover"

export interface PopupSelectorProps<T extends ValidComponent = ValidComponent>
  extends Omit<PopoverProps<T>, "style" | "children"> {
  /** Whether the selector is in expanded mode (wider + taller). */
  expanded: boolean
  /** Preferred width when collapsed. Default: 250 */
  preferredWidth?: number
  /** Preferred width when expanded. Default: 350 */
  preferredExpandedWidth?: number
  /** Body height when collapsed. Default: 300 */
  preferredHeight?: number
  /** Body height when expanded. Default: 600 */
  preferredExpandedHeight?: number
  /** Gap kept between popup edges and panel edges. Default: 8 */
  padding?: number
  /** Minimum popup width — never shrinks below this. Default: 100 */
  minWidth?: number
  /** Render prop — receives a reactive `bodyH` accessor. */
  children: (bodyH: Accessor<number>) => JSXElement
}

export function PopupSelector<T extends ValidComponent = ValidComponent>(props: PopupSelectorProps<T>) {
  const [local, rest] = splitProps(props, [
    "expanded",
    "preferredWidth",
    "preferredExpandedWidth",
    "preferredHeight",
    "preferredExpandedHeight",
    "padding",
    "minWidth",
    "children",
  ])

  const [panelW, setPanelW] = createSignal(document.documentElement.clientWidth)

  createEffect(() => {
    if (rest.open) {
      setPanelW(document.documentElement.clientWidth)
    }
  })

  const popoverW = createMemo(() => {
    const preferred = local.expanded ? (local.preferredExpandedWidth ?? 350) : (local.preferredWidth ?? 250)
    const pad = local.padding ?? 8
    return Math.max(local.minWidth ?? 100, Math.min(preferred, panelW() - pad * 2))
  })

  const bodyH = createMemo(() =>
    local.expanded ? (local.preferredExpandedHeight ?? 600) : (local.preferredHeight ?? 300),
  )

  return (
    <Popover
      placement="top-start"
      slide={true}
      overflowPadding={local.padding ?? 8}
      {...(rest as PopoverProps)}
      style={{ width: `${popoverW()}px`, "max-width": `${popoverW()}px` }}
    >
      {local.children(bodyH)}
    </Popover>
  )
}
