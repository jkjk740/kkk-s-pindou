export function windowInfo() {
  let info = {};
  try { info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync(); } catch {}
  const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
  const windowWidth = positive(info.windowWidth, 375);
  const windowHeight = positive(info.windowHeight, 667);
  const top = info.statusBarHeight ?? info.safeArea?.top;
  return { ...info, windowWidth, windowHeight, pixelRatio: positive(info.pixelRatio, 1), statusBarHeight: Number.isFinite(top) && top >= 0 && top <= 100 ? top : 20 };
}

export function navigationMetrics() {
  const info = windowInfo();
  let capsule;
  try { capsule = uni.getMenuButtonBoundingClientRect?.(); } catch {}
  const valid = capsule && capsule.height > 0 && capsule.height <= 60 && capsule.top >= info.statusBarHeight && capsule.top - info.statusBarHeight <= 30 && capsule.left > info.windowWidth / 2 && capsule.left < info.windowWidth;
  return {
    statusHeight: info.statusBarHeight,
    navHeight: valid ? Math.max(44, (capsule.top - info.statusBarHeight) * 2 + capsule.height) : 44,
    rightPadding: valid ? info.windowWidth - capsule.left + 12 : 96
  };
}
