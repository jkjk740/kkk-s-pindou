export function fitImage(image, viewport) {
  const ratio = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { imageWidth: image.width, imageHeight: image.height, width: image.width * ratio, height: image.height * ratio, viewportWidth: viewport.width, viewportHeight: viewport.height, ratio };
}
export function clampImagePose(pose, geometry) {
  const scale = Math.max(1, Math.min(8, pose.scale));
  const horizontal = Math.max(0, (geometry.width * scale - geometry.viewportWidth) / 2);
  const vertical = Math.max(0, (geometry.height * scale - geometry.viewportHeight) / 2);
  return { scale, x: Math.max(-horizontal, Math.min(horizontal, pose.x)), y: Math.max(-vertical, Math.min(vertical, pose.y)) };
}
export function toImagePoint(point, pose, geometry) {
  return { x: (point.x - geometry.viewportWidth / 2 - pose.x) / (geometry.ratio * pose.scale) + geometry.imageWidth / 2, y: (point.y - geometry.viewportHeight / 2 - pose.y) / (geometry.ratio * pose.scale) + geometry.imageHeight / 2 };
}
export function zoomImage(pose, scale, anchor, geometry) {
  scale = Math.max(1, Math.min(8, scale));
  const factor = scale / pose.scale;
  return clampImagePose({ scale, x: anchor.x - geometry.viewportWidth / 2 - (anchor.x - geometry.viewportWidth / 2 - pose.x) * factor, y: anchor.y - geometry.viewportHeight / 2 - (anchor.y - geometry.viewportHeight / 2 - pose.y) * factor }, geometry);
}
