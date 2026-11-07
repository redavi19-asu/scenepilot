function isMonitorPopup(url, frameName) {
  return url === 'about:blank' && /^uds-popout-(program|preview|main|multiview|director|screen|camera-[1-9])(?:--[a-f0-9]{32})?$/.test(frameName);
}
module.exports = { isMonitorPopup };
