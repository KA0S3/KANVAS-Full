export const cssUrl = (url: string | null | undefined) => (
  url ? `url(${JSON.stringify(url)})` : 'none'
);
