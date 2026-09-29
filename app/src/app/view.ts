export const views = ['dashboard', 'preparedness', 'sources', 'about'] as const;

export type View = (typeof views)[number];

export function isView(value: string): value is View {
  return views.includes(value as View);
}
