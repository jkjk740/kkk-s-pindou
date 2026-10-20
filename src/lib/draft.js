export function createImageDraft(image) {
  return {
    id: null,
    name: image.name || '我的图片作品',
    pattern: null,
    sourcePath: image.path,
    sourceImageId: image.sourceImageId,
    completedRows: [],
    size: 64,
    maxColors: 32,
    cutoutId: null,
    beadSize: 2.6,
    removeBackground: false,
    converted: false
  };
}
