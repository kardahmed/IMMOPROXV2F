interface FilterOption {
  value: string
  label: string
}

interface FilterDropdownProps {
  label: string
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
}

export function FilterDropdown({ label, options, value, onChange }: FilterDropdownProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary outline-none focus:border-immo-accent-green"
      aria-label={label}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
