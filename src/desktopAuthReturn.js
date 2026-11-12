export function desktopAuthReturn(location = window.location) {
  const params = new URLSearchParams(location.search);
  const value = params.get('return_to');
  if (value?.startsWith('/desktop-auth?')) return value;
  // Keep an invited camera's destination through login and subscription setup.
  if (params.get('camera') === '1') {
    const camera = new URLSearchParams({ camera: '1' });
    for (const key of ['network', 'room', 'join']) {
      const item = params.get(key);
      if (item && /^[A-Za-z0-9_-]{1,512}$/.test(item)) camera.set(key, item);
    }
    return `/app?${camera}`;
  }
  return '/app';
}
