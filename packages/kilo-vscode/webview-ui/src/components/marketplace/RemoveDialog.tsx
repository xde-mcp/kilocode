import { Component } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import type { MarketplaceItem } from "../../types/marketplace"

interface Props {
  item: MarketplaceItem
  scope: "project" | "global"
  onClose: () => void
  onConfirm: () => void
}

const RemoveDialog: Component<Props> = (props) => {
  return (
    <div class="marketplace-modal-overlay" onClick={props.onClose}>
      <div class="marketplace-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Remove {props.item.name}?</h3>
        <p>
          Are you sure you want to remove this {props.item.type}? This will remove it from your {props.scope}{" "}
          configuration.
        </p>
        <div class="marketplace-modal-actions">
          <Button variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" class="marketplace-remove-btn" onClick={props.onConfirm}>
            Remove
          </Button>
        </div>
      </div>
    </div>
  )
}

export default RemoveDialog
