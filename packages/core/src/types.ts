export type ComponentType = 'VEVENT' | 'VTODO' | 'VJOURNAL';

export const COMPONENT_TYPES: readonly ComponentType[] = [
  'VEVENT',
  'VTODO',
  'VJOURNAL',
] as const;
