import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface SearchInputProps {
  placeholder?: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export function SearchInput({
  placeholder = 'Rechercher...',
  value,
  onChange,
  className = '',
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-immo-text-muted" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 border-immo-border-default bg-immo-bg-primary ps-9 text-sm text-immo-text-primary placeholder:text-immo-text-muted focus:border-immo-accent-green focus:ring-immo-accent-green"
      />
    </div>
  )
}
