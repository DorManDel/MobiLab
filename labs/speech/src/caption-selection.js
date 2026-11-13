/**
 * A caption is committed at most once per paragraph.
 * Comparison providers may finish later; their results never replace a
 * committed subtitle. Explicit display provider or first-success wins.
 */
export function acceptCaption(row,providerId,text,receivedAt) {
  if(!row || !text || row.displayText)return false;
  const requested=row.captionProvider||"cloud";
  if(requested!=="fastest" && requested!==providerId)return false;
  row.displayText=text;
  row.displayProvider=providerId;
  row.finalToSubtitleMs=Math.max(0,receivedAt-row.finalPerf);
  return true;
}
