export function desktopAuthReturn() {
  const value=new URLSearchParams(window.location.search).get('return_to');
  return value?.startsWith('/desktop-auth?') ? value : '/app';
}
