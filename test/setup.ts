if (typeof Range !== "undefined") {
  if (Range.prototype.getClientRects === undefined)
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  if (Range.prototype.getBoundingClientRect === undefined)
    Range.prototype.getBoundingClientRect = () => new DOMRect();
}
