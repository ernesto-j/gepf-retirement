import type { ScenarioDefinition } from '../../engine/types'
import { SelectInput } from '../ui'

/** Select + new/edit/delete controls for one planner slot (A or B). Core routes (stay/preserve/cash) cannot be edited or deleted. */
export function ScenarioPicker({
  slotLabel,
  selectedId,
  allDefinitions,
  coreIds,
  onChange,
  onNew,
  onEdit,
  onDelete,
}: {
  slotLabel: string
  selectedId: string
  allDefinitions: ScenarioDefinition[]
  coreIds: Set<string>
  onChange: (id: string) => void
  onNew: () => void
  onEdit: (def: ScenarioDefinition) => void
  onDelete: (id: string) => void
}) {
  const selected = allDefinitions.find((d) => d.id === selectedId)
  const isCustom = !!selected && !coreIds.has(selected.id)

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <SelectInput
          label={slotLabel}
          value={selectedId}
          onChange={onChange}
          options={allDefinitions.map((d) => ({ value: d.id, label: d.name }))}
        />
      </div>
      <div className="mb-0.5 flex gap-1">
        <button type="button" className="btn-secondary" onClick={onNew} title="Create a new scenario">
          + New
        </button>
        {isCustom && selected && (
          <>
            <button type="button" className="btn-secondary" onClick={() => onEdit(selected)} title="Edit this scenario">
              Edit
            </button>
            <button
              type="button"
              className="btn-secondary text-red-700"
              onClick={() => onDelete(selected.id)}
              title="Delete this scenario"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}
